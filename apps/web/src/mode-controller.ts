import type { EditorMetadata } from './editor-archive';
import { defaultEditorMetadata, validateEditorMetadata } from './editor-archive';

export type EditorMode = 'programming' | 'upload';
export class ModeController {
  codeMode: EditorMetadata['codeMode'] = 'generated';
  manualSource: string | undefined;
  generatedSource = '';
  generationError = '';
  transitioning = false;
  error = '';
  codeVisible = true;
  private suppress = 0;
  private listeners = new Set<() => void>();
  private changingCode = false;
  constructor(private vm: any, private getStore: () => any, private busy: () => string, private changed: () => void) {}
  get editorMode(): EditorMode { return this.vm.runtime.isRealtimeMode() ? 'programming' : 'upload'; }
  get selectedSource() { return this.codeMode === 'manual' ? this.manualSource ?? '' : this.generatedSource; }
  get protocolActive() { return this.vm.runtime.getDevice().deviceId === 'arduinoUno' && this.editorMode === 'programming' && this.vm.getPeripheralIsConnected('arduinoUno'); }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  publish = () => this.listeners.forEach(fn => fn());
  metadata(): EditorMetadata { return { version: 1, codeMode: this.codeMode, ...(this.manualSource === undefined ? {} : { manualSource: this.manualSource }) }; }
  private setNativeCode() {
    const store = this.getStore(); if (!store || this.changingCode) return;
    const code = store.getState().scratchGui.code;
    this.changingCode = true;
    try {
      if (code.isCodeEditorLocked !== (this.codeMode === 'generated')) store.dispatch({ type: 'scratch-gui/code/TOGGLE_LOCK' });
      if (store.getState().scratchGui.code.codeEditorValue !== this.selectedSource) store.dispatch({ type: 'scratch-gui/code/UPDATE_CODE', value: this.selectedSource });
    } finally { this.changingCode = false; }
  }
  generate(Blockly: any, workspace: any) {
    if (!workspace) return;
    try {
      const code = Blockly.Arduino.workspaceToCode(workspace);
      this.generatedSource = code; this.generationError = '';
    } catch (e) { this.generationError = `代码生成失败：${e instanceof Error ? e.message : String(e)}`; }
    this.setNativeCode(); this.publish();
  }
  editManual(value: string) {
    if (this.changingCode || this.codeMode !== 'manual' || value === this.manualSource) return;
    if (new TextEncoder().encode(value).length > 1024 * 1024) { this.error = '手动源码最多 1 MiB。'; this.setNativeCode(); this.publish(); return; }
    this.manualSource = value; this.error = ''; this.setNativeCode();
    if (!this.suppress) this.changed(); this.publish();
  }
  chooseCode(codeMode: EditorMetadata['codeMode']) {
    if (codeMode === this.codeMode) return;
    const reason = this.busy(); if (reason) { this.error = reason; this.publish(); return; }
    if (codeMode === 'manual' && this.manualSource === undefined) this.manualSource = this.generatedSource;
    this.codeMode = codeMode; this.setNativeCode(); this.error = ''; if (!this.suppress) this.changed(); this.publish();
  }
  async chooseMode(mode: EditorMode) {
    if (mode === this.editorMode || this.transitioning) return;
    const reason = this.busy(); if (reason) { this.error = reason; this.publish(); return; }
    this.transitioning = true; this.error = ''; this.publish();
    try {
      this.vm.stopAll(); this.vm.runtime.setRealtimeMode(mode === 'programming');
      await new Promise(resolve => setTimeout(resolve, 40));
      this.setNativeCode(); window.dispatchEvent(new Event('resize'));
    } catch (e) { this.error = String(e); }
    finally { this.transitioning = false; this.publish(); }
  }
  async restore(metadata: EditorMetadata = defaultEditorMetadata()) {
    const state = validateEditorMetadata(metadata); this.suppress++;
    try {
      this.codeMode = state.codeMode; this.manualSource = state.manualSource; this.error = ''; this.generationError = '';
      // Loading dispatches generator/toolbox effects in a later GUI commit.
      await new Promise(resolve => setTimeout(resolve, 50)); this.setNativeCode(); this.publish();
    } finally { this.suppress--; }
  }
  nativeUpdated() { this.setNativeCode(); this.publish(); }
  get disabledReason() { return this.transitioning ? '正在切换模式…' : this.busy(); }
}
