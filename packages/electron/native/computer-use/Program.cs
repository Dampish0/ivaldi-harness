using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows.Automation;

namespace Ivaldi.ComputerUse;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly Dictionary<string, AutomationElement> Elements = new();
    private static readonly HashSet<int> ProtectedProcessIds = new();
    private static readonly HashSet<string> ProtectedProcesses = new(StringComparer.OrdinalIgnoreCase)
    {
        "1password", "authy", "bitwarden", "cmd", "conhost", "consent", "credentialui",
        "dashlane", "ivaldi", "keepass", "keepassxc", "nordpass", "openchamber", "powershell", "pwsh",
        "securityhealthsystray", "windowsterminal", "wt"
    };
    private static readonly string[] ProtectedTitles =
    {
        "User Account Control", "Windows Security", "Windows sign-in", "Credential Manager", "Ivaldi"
    };

    private static nint selectedWindow;
    private static string? currentSnapshotId;
    private static double snapshotScaleX = 1;
    private static double snapshotScaleY = 1;

    [STAThread]
    private static async Task Main(string[] args)
    {
        for (var index = 0; index < args.Length - 1; index++)
        {
            if (args[index] == "--protected-pid" && int.TryParse(args[index + 1], out var processId))
                ProtectedProcessIds.Add(processId);
        }
        ProtectedProcessIds.Add(Environment.ProcessId);

        while (await Console.In.ReadLineAsync() is { } line)
        {
            JsonObject response;
            string id = "unknown";
            try
            {
                var request = JsonNode.Parse(line)?.AsObject() ?? throw new InvalidOperationException("Invalid request");
                id = request["id"]?.GetValue<string>() ?? id;
                var action = request["action"]?.GetValue<string>() ?? throw new InvalidOperationException("action is required");
                var parameters = request["parameters"] as JsonObject ?? new JsonObject();
                response = new JsonObject { ["id"] = id, ["ok"] = true, ["data"] = Execute(action, parameters) };
            }
            catch (Exception error)
            {
                response = new JsonObject { ["id"] = id, ["ok"] = false, ["error"] = error.Message };
            }
            await Console.Out.WriteLineAsync(response.ToJsonString(JsonOptions));
            await Console.Out.FlushAsync();
        }
    }

    private static JsonNode Execute(string action, JsonObject parameters)
    {
        if (action == "window.list") return ListWindows();
        if (action == "window.select") return SelectWindow(RequireString(parameters, "windowId"));
        if (action == "computer.stop")
        {
            selectedWindow = 0;
            currentSnapshotId = null;
            Elements.Clear();
            return new JsonObject { ["stopped"] = true };
        }

        ValidateSelectedWindow();
        if (action == "computer.snapshot") return Snapshot();
        RequireCurrentSnapshot(parameters);
        FocusSelectedWindow();

        if (action == "computer.click") Click(parameters);
        else if (action == "computer.type") TypeText(parameters);
        else if (action == "computer.key") PressKey(parameters);
        else if (action == "computer.scroll") Scroll(parameters);
        else if (action == "computer.drag") Drag(parameters);
        else throw new InvalidOperationException($"Unsupported Computer Use action: {action}");

        Thread.Sleep(220);
        return Snapshot();
    }

    private static JsonArray ListWindows()
    {
        var windows = new JsonArray();
        EnumWindows((handle, _) =>
        {
            if (!IsWindowVisible(handle) || IsCloaked(handle)) return true;
            var title = WindowTitle(handle);
            if (string.IsNullOrWhiteSpace(title)) return true;
            GetWindowThreadProcessId(handle, out var processId);
            if (IsProtectedWindow(handle, processId, title)) return true;
            if (!GetWindowRect(handle, out var rect) || rect.Right - rect.Left < 80 || rect.Bottom - rect.Top < 60) return true;
            windows.Add(new JsonObject
            {
                ["windowId"] = $"0x{handle.ToInt64():X}",
                ["title"] = title,
                ["process"] = ProcessName(processId),
                ["width"] = rect.Right - rect.Left,
                ["height"] = rect.Bottom - rect.Top
            });
            return true;
        }, 0);
        return windows;
    }

    private static JsonNode SelectWindow(string windowId)
    {
        var raw = windowId.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? windowId[2..] : windowId;
        if (!long.TryParse(raw, System.Globalization.NumberStyles.HexNumber, null, out var value))
            throw new InvalidOperationException("windowId must come from window.list");
        selectedWindow = new nint(value);
        ValidateSelectedWindow();
        FocusSelectedWindow();
        Thread.Sleep(180);
        return Snapshot();
    }

    private static JsonObject Snapshot()
    {
        ValidateSelectedWindow();
        GetWindowRect(selectedWindow, out var rect);
        currentSnapshotId = Guid.NewGuid().ToString("N");
        Elements.Clear();
        var nodes = new JsonArray();
        var sourceWidth = Math.Max(1, rect.Right - rect.Left);
        var sourceHeight = Math.Max(1, rect.Bottom - rect.Top);
        var scale = Math.Min(1, Math.Min(1600d / sourceWidth, 1200d / sourceHeight));
        snapshotScaleX = scale;
        snapshotScaleY = scale;

        try
        {
            var root = AutomationElement.FromHandle(selectedWindow);
            AddElement(root, rect, nodes, 0);
        }
        catch (ElementNotAvailableException)
        {
        }
        catch (InvalidOperationException)
        {
        }

        using var bitmap = CaptureWindow(selectedWindow, rect);
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return new JsonObject
        {
            ["snapshotId"] = currentSnapshotId,
            ["window"] = WindowInfo(selectedWindow),
            ["elements"] = nodes,
            ["screenshot"] = new JsonObject
            {
                ["mime"] = "image/png",
                ["width"] = bitmap.Width,
                ["height"] = bitmap.Height,
                ["base64"] = Convert.ToBase64String(stream.ToArray())
            }
        };
    }

    private static void AddElement(AutomationElement element, RECT windowRect, JsonArray nodes, int depth)
    {
        if (depth > 7 || nodes.Count >= 220) return;
        try
        {
            var bounds = element.Current.BoundingRectangle;
            var offscreen = element.Current.IsOffscreen;
            if (!bounds.IsEmpty && !offscreen)
            {
                var id = $"e{nodes.Count + 1}";
                Elements[id] = element;
                var password = element.Current.IsPassword;
                nodes.Add(new JsonObject
                {
                    ["elementId"] = id,
                    ["role"] = element.Current.ControlType.ProgrammaticName.Replace("ControlType.", ""),
                    ["name"] = password ? "[password field]" : Limit(element.Current.Name, 180),
                    ["enabled"] = element.Current.IsEnabled,
                    ["password"] = password,
                    ["x"] = Math.Max(0, (int)Math.Round((bounds.X - windowRect.Left) * snapshotScaleX)),
                    ["y"] = Math.Max(0, (int)Math.Round((bounds.Y - windowRect.Top) * snapshotScaleY)),
                    ["width"] = Math.Max(0, (int)Math.Round(bounds.Width * snapshotScaleX)),
                    ["height"] = Math.Max(0, (int)Math.Round(bounds.Height * snapshotScaleY))
                });
            }

            var walker = TreeWalker.ControlViewWalker;
            var child = walker.GetFirstChild(element);
            while (child is not null && nodes.Count < 220)
            {
                AddElement(child, windowRect, nodes, depth + 1);
                child = walker.GetNextSibling(child);
            }
        }
        catch (ElementNotAvailableException)
        {
        }
    }

    private static Bitmap CaptureWindow(nint handle, RECT rect)
    {
        var sourceWidth = Math.Max(1, rect.Right - rect.Left);
        var sourceHeight = Math.Max(1, rect.Bottom - rect.Top);
        using var source = new Bitmap(sourceWidth, sourceHeight, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(source))
        {
            var hdc = graphics.GetHdc();
            var captured = PrintWindow(handle, hdc, 2);
            graphics.ReleaseHdc(hdc);
            if (!captured) graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, source.Size, CopyPixelOperation.SourceCopy);
        }
        if (snapshotScaleX >= 1 && snapshotScaleY >= 1) return new Bitmap(source);
        var scale = Math.Min(1600d / sourceWidth, 1200d / sourceHeight);
        var target = new Bitmap(Math.Max(1, (int)(sourceWidth * scale)), Math.Max(1, (int)(sourceHeight * scale)));
        using var targetGraphics = Graphics.FromImage(target);
        targetGraphics.DrawImage(source, 0, 0, target.Width, target.Height);
        return target;
    }

    private static void Click(JsonObject parameters)
    {
        var point = ResolvePoint(parameters);
        SetCursorPos(point.X, point.Y);
        SendMouse(MOUSEEVENTF_LEFTDOWN);
        SendMouse(MOUSEEVENTF_LEFTUP);
    }

    private static void TypeText(JsonObject parameters)
    {
        var elementId = OptionalString(parameters, "elementId");
        if (elementId is not null)
        {
            var element = RequireElement(elementId);
            if (element.Current.IsPassword) throw new InvalidOperationException("Ivaldi will not type into password fields");
            element.SetFocus();
        }
        var text = parameters["text"]?.GetValue<string>() ?? throw new InvalidOperationException("text is required");
        foreach (var character in text) SendUnicode(character);
    }

    private static void PressKey(JsonObject parameters)
    {
        var key = RequireString(parameters, "key").ToUpperInvariant();
        var modifiers = parameters["modifiers"]?.AsArray().Select(value => value?.GetValue<string>()?.ToUpperInvariant()).Where(value => value is not null).Cast<string>().ToArray() ?? [];
        foreach (var modifier in modifiers) SendVirtualKey(VirtualKey(modifier), false);
        if (key.Length == 1)
        {
            SendUnicode(key[0]);
        }
        else
        {
            var virtualKey = VirtualKey(key);
            SendVirtualKey(virtualKey, false);
            SendVirtualKey(virtualKey, true);
        }
        foreach (var modifier in modifiers.Reverse()) SendVirtualKey(VirtualKey(modifier), true);
    }

    private static void Scroll(JsonObject parameters)
    {
        var direction = OptionalString(parameters, "direction")?.ToLowerInvariant() ?? "down";
        if (direction != "up" && direction != "down") throw new InvalidOperationException("direction must be up or down");
        var amount = Math.Clamp(OptionalInt(parameters, "amount") ?? 3, 1, 20);
        var point = parameters["x"] is not null && parameters["y"] is not null ? ResolvePoint(parameters) : WindowCenter();
        SetCursorPos(point.X, point.Y);
        var input = MouseInput(MOUSEEVENTF_WHEEL, direction == "up" ? 120 * amount : -120 * amount);
        SendInput(1, [input], Marshal.SizeOf<INPUT>());
    }

    private static void Drag(JsonObject parameters)
    {
        GetWindowRect(selectedWindow, out var rect);
        var from = new Point(rect.Left + (int)Math.Round(RequireInt(parameters, "fromX") / snapshotScaleX), rect.Top + (int)Math.Round(RequireInt(parameters, "fromY") / snapshotScaleY));
        var to = new Point(rect.Left + (int)Math.Round(RequireInt(parameters, "toX") / snapshotScaleX), rect.Top + (int)Math.Round(RequireInt(parameters, "toY") / snapshotScaleY));
        SetCursorPos(from.X, from.Y);
        SendMouse(MOUSEEVENTF_LEFTDOWN);
        for (var step = 1; step <= 12; step++)
        {
            SetCursorPos(from.X + ((to.X - from.X) * step / 12), from.Y + ((to.Y - from.Y) * step / 12));
            Thread.Sleep(12);
        }
        SendMouse(MOUSEEVENTF_LEFTUP);
    }

    private static Point ResolvePoint(JsonObject parameters)
    {
        GetWindowRect(selectedWindow, out var rect);
        var elementId = OptionalString(parameters, "elementId");
        if (elementId is null)
            return new Point(
                rect.Left + (int)Math.Round(RequireInt(parameters, "x") / snapshotScaleX),
                rect.Top + (int)Math.Round(RequireInt(parameters, "y") / snapshotScaleY)
            );
        var bounds = RequireElement(elementId).Current.BoundingRectangle;
        return new Point((int)Math.Round(bounds.X + bounds.Width / 2), (int)Math.Round(bounds.Y + bounds.Height / 2));
    }

    private static Point WindowCenter()
    {
        GetWindowRect(selectedWindow, out var rect);
        return new Point((rect.Left + rect.Right) / 2, (rect.Top + rect.Bottom) / 2);
    }

    private static void ValidateSelectedWindow()
    {
        if (selectedWindow == 0 || !IsWindow(selectedWindow)) throw new InvalidOperationException("The selected window is no longer available");
        GetWindowThreadProcessId(selectedWindow, out var processId);
        var title = WindowTitle(selectedWindow);
        if (IsProtectedWindow(selectedWindow, processId, title)) throw new InvalidOperationException("Ivaldi will not control this protected window");
    }

    private static bool IsProtectedWindow(nint handle, int processId, string title)
    {
        if (ProtectedProcessIds.Contains(processId)) return true;
        if (ProtectedProcesses.Contains(ProcessName(processId))) return true;
        if (ProtectedTitles.Any(value => title.Contains(value, StringComparison.OrdinalIgnoreCase))) return true;
        return IsElevated(processId) && !IsElevated(Environment.ProcessId);
    }

    private static bool IsElevated(int processId)
    {
        var process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
        if (process == 0) return true;
        try
        {
            if (!OpenProcessToken(process, TOKEN_QUERY, out var token)) return true;
            try
            {
                var size = Marshal.SizeOf<TOKEN_ELEVATION>();
                var buffer = Marshal.AllocHGlobal(size);
                try
                {
                    return GetTokenInformation(token, TOKEN_INFORMATION_CLASS.TokenElevation, buffer, size, out _)
                        && Marshal.PtrToStructure<TOKEN_ELEVATION>(buffer).TokenIsElevated != 0;
                }
                finally { Marshal.FreeHGlobal(buffer); }
            }
            finally { CloseHandle(token); }
        }
        finally { CloseHandle(process); }
    }

    private static JsonObject WindowInfo(nint handle)
    {
        GetWindowThreadProcessId(handle, out var processId);
        GetWindowRect(handle, out var rect);
        return new JsonObject
        {
            ["windowId"] = $"0x{handle.ToInt64():X}",
            ["title"] = WindowTitle(handle),
            ["process"] = ProcessName(processId),
            ["width"] = rect.Right - rect.Left,
            ["height"] = rect.Bottom - rect.Top
        };
    }

    private static void FocusSelectedWindow()
    {
        ShowWindow(selectedWindow, SW_RESTORE);
        SetForegroundWindow(selectedWindow);
    }

    private static AutomationElement RequireElement(string id) => Elements.TryGetValue(id, out var element)
        ? element
        : throw new InvalidOperationException("elementId is not part of the current snapshot");

    private static void RequireCurrentSnapshot(JsonObject parameters)
    {
        var snapshotId = RequireString(parameters, "snapshotId");
        if (snapshotId != currentSnapshotId) throw new InvalidOperationException("snapshotId is stale; take a new snapshot before acting");
    }

    private static string RequireString(JsonObject parameters, string name) => OptionalString(parameters, name)
        ?? throw new InvalidOperationException($"{name} is required");
    private static string? OptionalString(JsonObject parameters, string name) => parameters[name]?.GetValue<string>() is { } value && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;
    private static int RequireInt(JsonObject parameters, string name) => OptionalInt(parameters, name) ?? throw new InvalidOperationException($"{name} is required");
    private static int? OptionalInt(JsonObject parameters, string name) => parameters[name] is null ? null : parameters[name]!.GetValue<int>();
    private static string Limit(string? value, int limit) => string.IsNullOrEmpty(value) ? "" : value.Length <= limit ? value : value[..limit];
    private static string WindowTitle(nint handle)
    {
        var length = GetWindowTextLength(handle);
        var builder = new StringBuilder(length + 1);
        GetWindowText(handle, builder, builder.Capacity);
        return builder.ToString();
    }
    private static string ProcessName(int processId)
    {
        try { return Process.GetProcessById(processId).ProcessName; }
        catch { return "unknown"; }
    }
    private static bool IsCloaked(nint handle)
    {
        var cloaked = 0;
        return DwmGetWindowAttribute(handle, 14, out cloaked, sizeof(int)) == 0 && cloaked != 0;
    }

    private static ushort VirtualKey(string key) => key switch
    {
        "CTRL" => 0x11, "ALT" => 0x12, "SHIFT" => 0x10, "META" => 0x5B,
        "ENTER" => 0x0D, "TAB" => 0x09, "ESCAPE" or "ESC" => 0x1B,
        "LEFT" => 0x25, "UP" => 0x26, "RIGHT" => 0x27, "DOWN" => 0x28,
        "HOME" => 0x24, "END" => 0x23, "DELETE" => 0x2E, "BACKSPACE" => 0x08,
        "SPACE" => 0x20, "PAGEUP" => 0x21, "PAGEDOWN" => 0x22,
        _ => throw new InvalidOperationException($"Unsupported key: {key}")
    };

    private static void SendUnicode(char character)
    {
        var down = KeyboardInput(0, character, KEYEVENTF_UNICODE);
        var up = KeyboardInput(0, character, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP);
        SendInput(2, [down, up], Marshal.SizeOf<INPUT>());
    }
    private static void SendVirtualKey(ushort key, bool keyUp) => SendInput(1, [KeyboardInput(key, 0, keyUp ? KEYEVENTF_KEYUP : 0)], Marshal.SizeOf<INPUT>());
    private static void SendMouse(uint flags) => SendInput(1, [MouseInput(flags, 0)], Marshal.SizeOf<INPUT>());
    private static INPUT KeyboardInput(ushort key, ushort scan, uint flags) => new() { type = INPUT_KEYBOARD, U = new InputUnion { keyboard = new KEYBDINPUT { wVk = key, wScan = scan, dwFlags = flags } } };
    private static INPUT MouseInput(uint flags, int data) => new() { type = INPUT_MOUSE, U = new InputUnion { mouse = new MOUSEINPUT { mouseData = data, dwFlags = flags } } };

    private delegate bool EnumWindowsProc(nint handle, nint parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, nint parameter);
    [DllImport("user32.dll")] private static extern bool IsWindow(nint handle);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint handle);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(nint handle);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(nint handle, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern int GetWindowThreadProcessId(nint handle, out int processId);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint handle, out RECT rect);
    [DllImport("user32.dll")] private static extern bool PrintWindow(nint handle, nint hdc, uint flags);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint handle);
    [DllImport("user32.dll")] private static extern bool ShowWindow(nint handle, int command);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(nint handle, int attribute, out int value, int size);
    [DllImport("kernel32.dll")] private static extern nint OpenProcess(uint access, bool inheritHandle, int processId);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(nint handle);
    [DllImport("advapi32.dll")] private static extern bool OpenProcessToken(nint process, uint access, out nint token);
    [DllImport("advapi32.dll")] private static extern bool GetTokenInformation(nint token, TOKEN_INFORMATION_CLASS infoClass, nint info, int length, out int returnLength);

    private const int SW_RESTORE = 9;
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    private const uint TOKEN_QUERY = 0x0008;
    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;

    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct INPUT { public uint type; public InputUnion U; }
    [StructLayout(LayoutKind.Explicit)] private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mouse;
        [FieldOffset(0)] public KEYBDINPUT keyboard;
    }
    [StructLayout(LayoutKind.Sequential)] private struct MOUSEINPUT { public int dx; public int dy; public int mouseData; public uint dwFlags; public uint time; public nint dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public nint dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] private struct TOKEN_ELEVATION { public int TokenIsElevated; }
    private enum TOKEN_INFORMATION_CLASS { TokenElevation = 20 }
}
