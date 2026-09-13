#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { CdpClient, evaluateValue } from './perf/cdp.mjs';
import { percentile, summarizeLongTasks, summarizeTraceEvents } from './perf/metrics.mjs';

// Attach to a foreground Android WebView through an existing ADB forward.
// Selectors refer to visible controls. No text, URLs, or application state is saved.
const [port, trigger, panel, output, preference] = process.argv.slice(2);
if (!port || !trigger || !panel || !output) {
  throw new Error('Usage: node scripts/profile-mobile-motion.mjs <CDP port> <trigger selector> <panel selector> <output.json> [reduce]');
}
if (preference && preference !== 'reduce') throw new Error('Optional preference must be reduce');
const targets = await (await fetch(`http://127.0.0.1:${Number(port)}/json/list`)).json();
const target = targets.find((entry) => entry.type === 'page' && entry.url.startsWith('https://localhost'));
if (!target) throw new Error('No installed Ivaldi WebView found');
const client = new CdpClient(target.webSocketDebuggerUrl);
await client.connect();
const trace = [];
let tracing = false;
client.on('Tracing.dataCollected', ({ value }) => {
  for (const { name, ph, dur, pid, tid, ts } of value) trace.push({ name, ph, dur, pid, tid, ts });
});
try {
  if (preference) await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const point = await evaluateValue(client, `(() => {
    if (document.visibilityState !== 'visible') throw new Error('WebView is backgrounded');
    const control = document.querySelector(${JSON.stringify(trigger)});
    if (!control || !control.checkVisibility() || control.closest('[inert]')) throw new Error('Trigger is unavailable');
    const rect = control.getBoundingClientRect();
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    if (!control.contains(document.elementFromPoint(point.x, point.y))) throw new Error('Trigger is covered');
    return point;
  })()`);
  if (!point) throw new Error('Trigger could not be measured');
  await client.send('Tracing.start', {
    categories: 'devtools.timeline,disabled-by-default-devtools.timeline,toplevel',
    transferMode: 'ReportEvents',
  });
  tracing = true;
  const probe = evaluateValue(client, `new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('No pointer input received')), 3000);
    document.addEventListener('pointerup', () => {
      clearTimeout(deadline);
      const start = performance.now();
      const captureDeadline = setTimeout(() => reject(new Error('Renderer stopped producing frames')), 2200);
      const frames = [];
      let clickMs = null;
      const click = () => { clickMs = performance.now() - start; };
      document.addEventListener('click', click, { once: true, capture: true });
      const tick = (now) => {
        const node = document.querySelector(${JSON.stringify(panel)});
        const rect = node?.getBoundingClientRect();
        const style = node ? getComputedStyle(node) : null;
        frames.push({ t: now - start, x: rect?.x ?? null, y: rect?.y ?? null,
          opacity: style?.opacity ?? null, transform: style?.transform ?? null,
          visible: node?.checkVisibility() ?? false,
          controls: node?.querySelectorAll('button,input,[contenteditable="true"]').length ?? 0 });
        if (now - start < 1000) requestAnimationFrame(tick);
        else {
          clearTimeout(captureDeadline);
          document.removeEventListener('click', click, true);
          resolve({ frames, clickMs, width: innerWidth, height: innerHeight, visibility: document.visibilityState });
        }
      };
      requestAnimationFrame(tick);
    }, { once: true, capture: true });
  })`);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const samples = await probe;
  const complete = client.once('Tracing.tracingComplete');
  await client.send('Tracing.end');
  await complete;
  tracing = false;
  const tasks = summarizeLongTasks(trace);
  if (!samples || samples.visibility !== 'visible' || samples.frames.length < 20 || tasks.taskCount === 0) {
    throw new Error('Invalid capture: foreground frames and trace tasks are required');
  }
  const frames = samples.frames;
  const gaps = frames.slice(1).map((frame, index) => frame.t - frames[index].t);
  const summary = {
    clickMs: samples.clickMs,
    frameCount: frames.length, frameGapP50Ms: percentile(gaps, 0.5), frameGapP95Ms: percentile(gaps, 0.95),
    maxFrameGapMs: percentile(gaps, 1),
    firstVisibleMs: frames.find((frame) => frame.visible)?.t ?? null,
    firstContentMs: frames.find((frame) => frame.visible && frame.controls > 2)?.t ?? null,
    visibleFrames: frames.filter((frame) => frame.visible).length,
    ...tasks, trace: summarizeTraceEvents(trace),
  };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify({ summary, ...samples }, null, 2));
  console.log(JSON.stringify(summary));
} finally {
  if (tracing) await client.send('Tracing.end');
  if (preference) await client.send('Emulation.setEmulatedMedia', { features: [] });
  client.close();
}
