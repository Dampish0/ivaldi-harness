import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import {
  CustomProviderError, createEmptyCustomProviderForm, createHeaderRow, createModelRow, validateCustomProviderForm,
  type CustomProviderEditor, type CustomProviderErrorReason, type CustomProviderFormState, type CustomProviderProtocol,
  type CustomProvidersStore, type CustomProviderValidation,
} from '../runtime/custom-providers';
import type { ProvidersStore } from '../runtime/providers';
import { Button } from './ui';
import { SettingsForm, SettingsHeader, SettingsInput, SettingsRow, SettingsSection } from './SettingsControls';

type EditorPage = { kind: 'form' | 'protocol' } | { kind: 'model' | 'header'; row: string };
export interface CustomProviderNavigation { back(): void }
const protocols = {
  'openai-chat': 'settings.providers.page.custom.field.protocol.openaiChat',
  'openai-responses': 'settings.providers.page.custom.field.protocol.openaiResponses',
  'anthropic-messages': 'settings.providers.page.custom.field.protocol.anthropicMessages',
} satisfies { [key in CustomProviderProtocol]: MessageKey };
const protocolOptions: CustomProviderProtocol[] = ['openai-chat', 'openai-responses', 'anthropic-messages'];
const scopeLabels = {
  user: 'settings.providers.page.connectionDetails.source.userConfig',
  project: 'settings.providers.page.connectionDetails.source.projectConfig',
  custom: 'settings.providers.page.connectionDetails.source.customConfig',
} satisfies { [scope in CustomProviderEditor['scope']]: MessageKey };
const failureKeys = {
  invalidInput: 'mobile.native.customProvider.reviewFields',
  conflict: 'mobile.native.customProvider.conflict',
  unsupported: 'mobile.native.customProvider.unsupported',
  upgrade: 'mobile.native.customProvider.upgrade',
  request: 'mobile.native.customProvider.saveFailed',
  credentialSavedConfigFailed: 'mobile.native.customProvider.partial',
  credentialSavedConflict: 'mobile.native.customProvider.partialConflict',
  busy: 'common.loading', unavailable: 'mobile.native.customProvider.loadFailed',
} satisfies { [reason in CustomProviderErrorReason]: MessageKey };

export function CustomProviderSettings({ ref, store, providers, providerID, compactEditing, back, close, saved, removed }: {
  ref: React.Ref<CustomProviderNavigation>; store: CustomProvidersStore; providers: ProvidersStore;
  providerID: string | null; compactEditing: boolean; back: () => void; close: () => void; saved: (providerID: string) => void; removed: () => void;
}) {
  const { t } = useI18n(); const { colors } = useTheme(); const { font, text } = useTypography();
  const state = useSyncExternalStore(providers.subscribe, providers.getSnapshot);
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [form, setForm] = useState(createEmptyCustomProviderForm);
  const [editor, setEditor] = useState<CustomProviderEditor>();
  const [loadState, setLoadState] = useState<'loading' | 'failed' | 'ready'>(providerID ? 'loading' : 'ready');
  const [localFailure, setFailure] = useState<CustomProviderErrorReason | null>(null);
  const [validation, setValidation] = useState<CustomProviderValidation>();
  const [localCredentialPending, setCredentialPending] = useState(false);
  const retainedCredential = store.hasPendingCredential(form.providerID.trim());
  const credentialPending = localCredentialPending || retainedCredential;
  const failure = localFailure ?? (retainedCredential ? 'credentialSavedConfigFailed' : null);
  const [failureOperation, setFailureOperation] = useState<'save' | 'remove'>('save');
  const [page, setPage] = useState<EditorPage>({ kind: 'form' });
  const [direction, setDirection] = useState(0);
  const [showBusy, setShowBusy] = useState(false);
  const baseline = useRef(JSON.stringify(form)); const alive = useRef(true);
  const pending = useRef(false); const readRequest = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null); const rootOffset = useRef(0);
  const busy = state.mutation !== null || loadState === 'loading';
  const dirty = credentialPending || JSON.stringify(form) !== baseline.current;
  const selectedModel = page.kind === 'model' ? form.models.find(item => item.row === page.row) : undefined;
  const selectedHeader = page.kind === 'header' ? form.headers.find(item => item.row === page.row) : undefined;
  const modelError = selectedModel ? validation?.models[form.models.indexOf(selectedModel)] : undefined;
  const headerError = selectedHeader ? validation?.headers[form.headers.indexOf(selectedHeader)] : undefined;
  const secondary = [text(14, 21), { fontFamily: font.regular, color: colors.surface.mutedForeground }];

  const load = useCallback(async (id: string) => {
    readRequest.current?.abort(); const request = new AbortController(); readRequest.current = request;
    setLoadState('loading'); setFailure(null); Keyboard.dismiss();
    try {
      const result = await store.readEditor(id, request.signal);
      if (request.signal.aborted || !alive.current) return;
      setEditor(result); setForm(result.form); baseline.current = JSON.stringify(result.form);
      setValidation(undefined); setCredentialPending(false); setPage({ kind: 'form' }); setDirection(0); rootOffset.current = 0; setLoadState('ready');
    } catch (error) {
      if (!request.signal.aborted && alive.current) { setLoadState('failed'); setFailure(error instanceof CustomProviderError ? error.reason : 'request'); }
    }
  }, [store]);
  useEffect(() => {
    alive.current = true; if (providerID) void load(providerID);
    return () => { alive.current = false; readRequest.current?.abort(); };
  }, [providerID, load]);
  useEffect(() => {
    setShowBusy(false); if (!state.mutation) return;
    const timer = setTimeout(() => setShowBusy(true), 500); return () => clearTimeout(timer);
  }, [state.mutation]);
  const leave = (action: () => void) => {
    Keyboard.dismiss(); if (pending.current || state.mutation) return;
    if (!dirty) { action(); return; }
    Alert.alert(t('mobile.native.customProvider.discardTitle'), t('mobile.native.customProvider.discardDetail'), [
      { text: t('settings.providers.page.actions.cancel'), style: 'cancel' },
      { text: t('filesView.unsaved.discard'), style: 'destructive', onPress: action },
    ]);
  };
  const navigate = (target: EditorPage) => { Keyboard.dismiss(); setDirection(target.kind === 'form' ? -1 : 1); setPage(target); };
  const onBack = () => {
    Keyboard.dismiss(); if (pending.current || state.mutation) return;
    if (page.kind !== 'form') navigate({ kind: 'form' }); else leave(back);
  };
  useImperativeHandle(ref, () => ({ back: onBack }));
  const change = <Key extends keyof CustomProviderFormState>(key: Key, value: CustomProviderFormState[Key]) => {
    setForm(previous => ({ ...previous, [key]: value })); setValidation(undefined);
    if (failure === 'invalidInput' || failure === 'conflict' && !editor && !credentialPending) setFailure(null);
  };
  const fieldError = (error: 'required' | 'format' | 'duplicate' | 'exists' | 'immutable' | undefined): string | undefined => error ? t(error === 'required' ? 'settings.providers.page.custom.error.required' : error === 'duplicate' ? 'settings.providers.page.custom.error.duplicate' : error === 'exists' ? 'settings.providers.page.custom.error.providerID.exists' : 'mobile.native.customProvider.invalidValue') : undefined;
  const recover = (error: CustomProviderError) => {
    setFailure(error.reason); setValidation(error.validation);
    if (error.reason === 'credentialSavedConfigFailed' || error.reason === 'credentialSavedConflict') {
      setCredentialPending(true); setForm(previous => ({ ...previous, apiKey: '' }));
    }
  };
  const submit = async () => {
    if (pending.current || busy) return;
    Keyboard.dismiss();
    const errors = validateCustomProviderForm(form, editor, credentialPending || !editor);
    const modelIndex = errors.models.findIndex(item => item.id || item.name);
    const headerIndex = errors.headers.findIndex(item => item.key || item.value);
    if (Object.keys(errors.fields).length || modelIndex >= 0 || headerIndex >= 0) {
      setValidation(errors); setFailure('invalidInput');
      if (Object.keys(errors.fields).length) { navigate({ kind: 'form' }); scroll.current?.scrollTo({ y: 0, animated: true }); }
      else if (modelIndex >= 0) navigate({ kind: 'model', row: form.models[modelIndex].row });
      else navigate({ kind: 'header', row: form.headers[headerIndex].row });
      return;
    }
    pending.current = true; setFailure(null); setFailureOperation('save');
    try { await store.save(form, editor); if (alive.current) saved(form.providerID.trim()); }
    catch (error) { if (alive.current) recover(error instanceof CustomProviderError ? error : new CustomProviderError('request')); }
    finally { pending.current = false; }
  };
  const reload = () => {
    Keyboard.dismiss();
    const id = editor?.providerID ?? providerID ?? form.providerID.trim();
    if (!dirty) { void load(id); return; }
    Alert.alert(t('mobile.native.customProvider.reload'), t('mobile.native.customProvider.reloadDetail'), [
      { text: t('settings.providers.page.actions.cancel'), style: 'cancel' },
      { text: t('mobile.native.customProvider.reload'), style: 'destructive', onPress: () => { void load(id); } },
    ]);
  };
  const remove = () => {
    if (!editor?.exists || busy) return;
    Keyboard.dismiss();
    Alert.alert(t('mobile.native.customProvider.removeTitle'), t('mobile.native.customProvider.removeDetail', { scope: t(scopeLabels[editor.scope]) }), [
      { text: t('settings.providers.page.actions.cancel'), style: 'cancel' },
      { text: t('mobile.native.customProvider.remove'), style: 'destructive', onPress: () => {
        pending.current = true; setFailure(null); setFailureOperation('remove');
        void store.remove(editor).then(() => { if (alive.current) removed(); }).catch(error => {
          if (alive.current) recover(error instanceof CustomProviderError ? error : new CustomProviderError('request'));
        }).finally(() => { pending.current = false; });
      } },
    ]);
  };
  const title = t(page.kind === 'protocol' ? 'settings.providers.page.custom.field.protocol.label' : page.kind === 'model' ? 'mobile.native.customProvider.model' : page.kind === 'header' ? 'mobile.native.customProvider.header' : editor?.exists ? 'settings.providers.page.custom.editTitle' : 'settings.providers.page.custom.title');
  const pageKey = page.kind === 'model' || page.kind === 'header' ? `${page.kind}:${page.row}` : page.kind;
  const conflict = failure === 'conflict' || failure === 'credentialSavedConflict';

  return <Animated.View key={pageKey} entering={direction === 0 ? undefined : (direction > 0 ? FadeInRight : FadeInLeft).duration(220).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(100).reduceMotion(ReduceMotion.System)} style={styles.page}>
    <SettingsHeader title={title} back={onBack} close={() => leave(close)} hidden={compactEditing} disabled={state.mutation !== null} />
    {showBusy && <Text accessibilityLiveRegion="polite" style={[secondary, styles.notice]}>{t('settings.common.actions.saving')}</Text>}
    {failure && !compactEditing && <View style={styles.notice}>
      <Text accessibilityRole="alert" style={[secondary, { color: colors.status.error }]}>{t(loadState === 'failed' && failure === 'request' ? 'mobile.native.customProvider.loadFailed' : failure === 'request' && failureOperation === 'remove' ? 'mobile.native.customProvider.removeFailed' : failureKeys[failure])}</Text>
      {conflict && <Button variant="setting" icon="restart" label={t('mobile.native.customProvider.reload')} onPress={reload} disabled={busy} testID="custom-provider-reload" />}
    </View>}
    {loadState !== 'ready' ? <View style={styles.notice}>
      {loadState === 'loading' ? <Text style={secondary}>{t('common.loading')}</Text> : <Button variant="setting" icon="restart" label={t('settings.common.actions.retry')} onPress={() => { void load(editor?.providerID ?? providerID ?? form.providerID.trim()); }} testID="custom-provider-load-retry" />}
    </View> : <SettingsForm key={pageKey} scrollRef={scroll} compactEditing={compactEditing} contentContainerStyle={styles.content} contentOffset={{ x: 0, y: page.kind === 'form' ? rootOffset.current : 0 }} onScroll={event => { if (page.kind === 'form') rootOffset.current = event.nativeEvent.contentOffset.y; }} testID={`settings-page-custom-${page.kind}`}>
      {page.kind === 'form' && <>
        <SettingsSection title={t(scopeLabels[editor?.scope ?? 'user'])}>
          <SettingsInput label={t('settings.providers.page.custom.field.providerID.label')} value={form.providerID} onChangeText={value => change('providerID', value)} editable={!busy && !editor && !localCredentialPending} error={fieldError(validation?.fields.providerID)} placeholder={t('settings.providers.page.custom.field.providerID.placeholder')} testID="custom-provider-id" />
          <SettingsInput label={t('settings.providers.page.custom.field.name.label')} value={form.name} onChangeText={value => change('name', value)} editable={!busy} error={fieldError(validation?.fields.name)} placeholder={t('settings.providers.page.custom.field.name.placeholder')} testID="custom-provider-name" />
          <SettingsRow title={t('settings.providers.page.custom.field.protocol.label')} value={t(protocols[form.protocol])} icon="global" onPress={() => navigate({ kind: 'protocol' })} disabled={busy} testID="custom-provider-protocol" />
          <SettingsInput label={t('settings.providers.page.custom.field.baseURL.label')} value={form.baseURL} onChangeText={value => change('baseURL', value)} editable={!busy} keyboardType="url" error={fieldError(validation?.fields.baseURL)} placeholder={t('settings.providers.page.custom.field.baseURL.placeholder')} testID="custom-provider-url" />
          <SettingsInput label={t('settings.providers.page.custom.field.apiKey.label')} value={form.apiKey} onChangeText={value => change('apiKey', value)} editable={!busy && !localCredentialPending} secureTextEntry autoComplete="off" importantForAutofill="no" error={validation?.fields.apiKey === 'immutable' && credentialPending ? t('mobile.native.customProvider.partial') : fieldError(validation?.fields.apiKey)} placeholder={t(editor || credentialPending ? 'settings.providers.page.custom.field.apiKey.editPlaceholder' : 'settings.providers.page.custom.field.apiKey.placeholder')} testID="custom-provider-key" />
        </SettingsSection>
        <SettingsSection title={t('settings.providers.page.custom.models.title')}>
          {validation?.fields.models && <Text accessibilityRole="alert" style={[secondary, styles.notice, { color: colors.status.error }]}>{t('mobile.native.customProvider.modelsRequired')}</Text>}
          {form.models.map(model => <SettingsRow key={model.row} title={model.name || model.id || t('mobile.native.customProvider.newModel')} value={model.name ? model.id : undefined} icon="robot" onPress={() => navigate({ kind: 'model', row: model.row })} disabled={busy} testID={`custom-model-${model.row}`} />)}
          <Button variant="setting" icon="add" label={t('settings.providers.page.custom.models.add')} disabled={busy} onPress={() => { const model = createModelRow(); change('models', [...form.models, model]); navigate({ kind: 'model', row: model.row }); }} testID="custom-model-add" />
        </SettingsSection>
        <SettingsSection title={t('settings.providers.page.custom.headers.title')}>
          {form.headers.filter(header => header.key || header.value).map(header => <SettingsRow key={header.row} title={header.key || t('mobile.native.customProvider.newHeader')} icon="shield" onPress={() => navigate({ kind: 'header', row: header.row })} disabled={busy} testID={`custom-header-${header.row}`} />)}
          <Button variant="setting" icon="add" label={t('settings.providers.page.custom.headers.add')} disabled={busy} onPress={() => { const empty = form.headers.find(header => !header.key && !header.value); const header = empty ?? createHeaderRow(); if (!empty) change('headers', [...form.headers, header]); navigate({ kind: 'header', row: header.row }); }} testID="custom-header-add" />
        </SettingsSection>
        <Button variant="action" label={t(editor?.exists ? 'settings.providers.page.custom.actions.update' : 'settings.providers.page.custom.actions.save')} disabled={busy || conflict || failure === 'upgrade' || failure === 'unsupported'} onPress={() => { void submit(); }} style={styles.action} testID="custom-provider-save" />
        {editor?.exists && <SettingsSection><Button variant="setting" icon="delete-bin" label={t('mobile.native.customProvider.remove')} onPress={remove} disabled={busy || conflict} testID="custom-provider-remove" /></SettingsSection>}
      </>}
      {page.kind === 'protocol' && <SettingsSection>{protocolOptions.map(protocol => <Button key={protocol} variant="setting" showSelection selected={form.protocol === protocol} label={t(protocols[protocol])} disabled={busy} onPress={() => { change('protocol', protocol); navigate({ kind: 'form' }); }} testID={`custom-protocol-${protocol}`} />)}</SettingsSection>}
      {selectedModel && <SettingsSection>
        <SettingsInput label={t('settings.providers.page.custom.models.idLabel')} value={selectedModel.id} onChangeText={id => change('models', form.models.map(model => model.row === selectedModel.row ? { ...model, id } : model))} editable={!busy} error={fieldError(modelError?.id)} placeholder={t('settings.providers.page.custom.models.idPlaceholder')} testID="custom-model-id" />
        <SettingsInput label={t('settings.providers.page.custom.models.nameLabel')} value={selectedModel.name} onChangeText={name => change('models', form.models.map(model => model.row === selectedModel.row ? { ...model, name } : model))} editable={!busy} error={fieldError(modelError?.name)} placeholder={t('settings.providers.page.custom.models.namePlaceholder')} testID="custom-model-name" />
        <Button variant="action" label={t('mobile.sessions.doneEditing')} disabled={busy} onPress={() => navigate({ kind: 'form' })} style={styles.action} testID="custom-model-done" />
        <Button variant="setting" icon="delete-bin" label={t('settings.providers.page.custom.models.remove')} disabled={busy} onPress={() => { change('models', form.models.filter(model => model.row !== selectedModel.row)); navigate({ kind: 'form' }); }} testID="custom-model-remove" />
      </SettingsSection>}
      {selectedHeader && <SettingsSection>
        <SettingsInput label={t('settings.providers.page.custom.headers.keyLabel')} value={selectedHeader.key} onChangeText={key => change('headers', form.headers.map(header => header.row === selectedHeader.row ? { ...header, key } : header))} editable={!busy} error={fieldError(headerError?.key)} placeholder={t('settings.providers.page.custom.headers.keyPlaceholder')} testID="custom-header-name" />
        <SettingsInput label={t('settings.providers.page.custom.headers.valueLabel')} value={selectedHeader.value} onChangeText={value => change('headers', form.headers.map(header => header.row === selectedHeader.row ? { ...header, value } : header))} editable={!busy} secureTextEntry autoComplete="off" importantForAutofill="no" error={fieldError(headerError?.value)} placeholder={t('settings.providers.page.custom.headers.valuePlaceholder')} testID="custom-header-value" />
        <Button variant="action" label={t('mobile.sessions.doneEditing')} disabled={busy} onPress={() => navigate({ kind: 'form' })} style={styles.action} testID="custom-header-done" />
        <Button variant="setting" icon="delete-bin" label={t('settings.providers.page.custom.headers.remove')} disabled={busy} onPress={() => { change('headers', form.headers.filter(header => header.row !== selectedHeader.row)); navigate({ kind: 'form' }); }} testID="custom-header-remove" />
      </SettingsSection>}
    </SettingsForm>}
  </Animated.View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 32 },
  notice: { paddingHorizontal: 24, paddingVertical: 12 }, action: { marginHorizontal: 12, marginVertical: 12, maxWidth: 480 },
});
