export type SettingsPage =
  | 'home' | 'general' | 'mode' | 'appearance' | 'theme' | 'font' | 'text-size' | 'density' | 'language' | 'chat'
  | 'sessions' | 'default-model' | 'default-agent' | 'default-effort'
  | 'advanced' | 'providers' | 'provider-detail' | 'provider-auth' | 'provider-custom' | 'settings-project';

export type SettingsDestination = Exclude<SettingsPage, 'home' | 'provider-detail' | 'provider-auth'> | 'connections';
type SettingsMode = 'work' | 'developer';

/** Native destinations follow the visibility and reachability policy in shared lib/productMode.ts. */
export function getSettingsParent(destination: SettingsDestination, mode: SettingsMode) {
  switch (destination) {
    case 'mode': return 'general';
    case 'theme': case 'font': case 'text-size': case 'density': return 'appearance';
    case 'default-model': case 'default-agent': case 'default-effort': return 'sessions';
    case 'providers': return mode === 'work' ? 'advanced' : 'home';
    case 'provider-custom': return 'providers';
    default: return 'home';
  }
}

export function settingsSearchPath(destination: Exclude<SettingsDestination, 'connections'>, mode: SettingsMode): SettingsPage[] {
  if (destination === 'advanced' && mode === 'developer') return ['home'];
  const parent = getSettingsParent(destination, mode);
  return parent === 'home' ? ['home', destination] : [...settingsSearchPath(parent, mode), destination];
}

export function reconcileSettingsMode(stack: SettingsPage[], mode: SettingsMode): SettingsPage[];
export function reconcileSettingsMode(stack: readonly SettingsPage[], mode: SettingsMode): readonly SettingsPage[];
export function reconcileSettingsMode(stack: readonly SettingsPage[], mode: SettingsMode): readonly SettingsPage[] {
  if (stack.length === 0) return ['home'];
  if (mode === 'developer') {
    if (!stack.includes('advanced')) return stack;
    const next = stack.filter(page => page !== 'advanced');
    return next.length ? next : ['home'];
  }
  const providersIndex = stack.indexOf('providers');
  if (providersIndex < 0 || providersIndex === 2 && stack[0] === 'home' && stack[1] === 'advanced') return stack;
  return ['home', 'advanced', ...stack.slice(providersIndex)];
}
