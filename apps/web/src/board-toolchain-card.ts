import type { HardwareController } from './hardware-controller.ts';

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes < 1024 ** 2 ? 1 : bytes < 1024 ** 3 ? 2 : 3;
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB'][unit]}`;
};

// Identity comes from the task profile, never from the currently selected board's label.
export function boardToolchainState(hardware: HardwareController, deviceId: string) {
  const state = hardware.snapshot(), tc = state.toolchain;
  const taskProfile = state.profiles.find(p => p.id === tc.profileId && p.deviceId === deviceId);
  const profile = taskProfile ?? hardware.boardProfile(deviceId);
  const entry = tc.profiles.find(p => p.profileId === profile?.id);
  const ownTask = !!profile && tc.profileId === profile.id && (!tc.job || tc.job.planId === entry?.planId);
  const shared = !!profile && !ownTask && hardware.isPreparingProfile(profile.id);
  const busy = (ownTask || shared) && tc.busy;
  const online = !hardware.linkDisabledReason && state.localService.status === 'online';
  const fresh = online && hardware.boardToolchainEvidenceCurrent;
  const capable = !!profile?.compileAvailable && !!profile.uploadAvailable;
  const ready = fresh && !busy && entry?.state === 'ready' && capable;
  const failed = fresh && !capable && !busy && !!entry?.installable && (entry.state === 'failed' ||
    entry.state === 'missing' && ownTask && hardware.toolchains.observation.jobCurrent && (tc.job?.state === 'failed' || tc.job?.state === 'cancelled'));
  const missing = fresh && !capable && !busy && entry?.state === 'missing' && entry.installable;
  const installable = missing || failed;
  const progress = busy && tc.job?.phase === 'downloading' ? tc.job.progress : undefined;
  const percent = progress?.totalBytes && progress.totalBytes > 0 ? Math.min(100, Math.round(progress.downloadedBytes / progress.totalBytes * 100)) : undefined;
  const phase = !tc.job ? tc.message || '正在提交下载请求' : tc.job.state === 'cancelling' ? '正在取消下载' :
    ({ resolving: '正在检查依赖', downloading: '下载中', installing: '正在安装', validating: '正在校验', complete: '正在确认环境' }[tc.job?.phase ?? 'resolving']);
  const message = busy ? hardware.linkDisabledReason ? '等待 CCraft Link 恢复，下载结果尚未确认。' : shared ? `共享环境准备中 · ${phase}` : phase :
    failed ? (ownTask && (tc.error || tc.job?.error?.message || (tc.job?.state === 'cancelled' ? '下载已取消' : '')) || entry?.reason || '下载失败，请重试。') : '';
  return { profile, shared, busy, ready, failed, installable, online, progress, percent, message, taskProfileId: tc.profileId, planId: tc.job?.planId,
    // Missing/unknown services never lock the original offline board-selection catalog.
    needsDownload: installable,
    disabledReason: profile ? hardware.boardPrepareDisabledReason(deviceId, profile.id) : '',
    cancelAvailable: ownTask && busy && tc.cancelAvailable,
    legacy: !!profile && tc.support === 'legacy' };
}

export function boardSelectionHint(hardware: HardwareController, deviceId: string) {
  const card = boardToolchainState(hardware, deviceId);
  return card.busy ? '正在下载，请等待完成后再点击卡片加载。' : card.needsDownload ? '请先点击此卡片右上角的下载图标，下载完成后再次点击卡片加载。' : '';
}

export function renderBoardToolchain(R: any, hardware: HardwareController, deviceId: string, name: string,
  onError: (message: string) => void, feedback = '') {
  const card = boardToolchainState(hardware, deviceId);
  const byteProgress = card.progress ? `已下载 ${formatBytes(card.progress.downloadedBytes)}${card.progress.totalBytes && card.progress.totalBytes > 0 ? ` / ${formatBytes(card.progress.totalBytes)}` : ''}` : undefined;
  const taskId = hardware.snapshot().toolchain.job?.id;
  const stop = (event: any) => event.stopPropagation();
  const actionable = card.needsDownload;
  const label = `${card.failed ? '重试下载' : '下载'} ${name} 编译环境`;
  const controls = actionable ? R.createElement('button', {
    type: 'button', className: 'cfzn-card-download',
    disabled: !!card.disabledReason,
    title: card.disabledReason || label, 'data-profile-id': card.profile?.id, 'data-state': card.failed ? 'failed' : 'missing',
    'aria-label': label,
    onClick: (event: any) => {
      stop(event); onError('');
      if (!actionable || card.disabledReason) return;
      void hardware.prepareBoardToolchain(deviceId, card.profile!.id).catch(error => onError(error instanceof Error ? error.message : String(error)));
    },
  }, R.createElement('svg', { viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': true, focusable: false },
    R.createElement('path', { d: 'M12 3v11m-4-4 4 4 4-4M4 16v5h16v-5', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }))) : null;
  const overlay = card.busy && R.createElement('div', { className: 'cfzn-card-preparation',
    'data-device-id': deviceId, 'data-profile-id': card.profile?.id, 'data-task-profile-id': card.taskProfileId,
    'data-plan-id': card.planId, onClick: stop, 'aria-label': `${name} 编译环境下载` },
    R.createElement('span', { className: 'cfzn-card-preparation-spinner', 'aria-hidden': true }),
    R.createElement('strong', { role: 'status' }, card.message, card.percent === undefined ? '' : ` ${card.percent}%`),
    byteProgress && R.createElement('small', { className: 'cfzn-card-download-bytes' }, byteProgress),
    !card.shared && hardware.snapshot().toolchain.error && R.createElement('small', { role: 'status' }, hardware.snapshot().toolchain.error),
    R.createElement('progress', { 'aria-label': `${name} 下载进度`, title: byteProgress, 'aria-valuetext': byteProgress,
      ...(card.progress?.totalBytes && card.progress.totalBytes > 0 ? { max: card.progress.totalBytes, value: card.progress.downloadedBytes } : {}) }, byteProgress),
    !card.shared && R.createElement('button', { type: 'button', disabled: !card.cancelAvailable,
      onClick: (event: any) => {
        stop(event);
        const latest = hardware.snapshot();
        if (latest.toolchain.profileId !== card.profile?.id || latest.toolchain.job?.id !== taskId) return;
        void (latest.pendingAction ? hardware.cancel() : hardware.toolchains.cancel());
      } }, '取消下载'));
  const note = (card.needsDownload || card.busy) ? feedback || (card.failed ? card.message : '') : '';
  const decoration = (controls || overlay || note) ? R.createElement('div', { className: 'cfzn-card-download-layer',
    'data-device-id': deviceId, 'data-profile-id': card.profile?.id },
    card.needsDownload && R.createElement('div', { className: 'cfzn-card-download-veil', 'aria-hidden': true }),
    controls, overlay,
    note && R.createElement('div', { className: 'cfzn-card-download-note', role: card.failed ? 'alert' : 'status' }, note)) : null;
  return { ...card, controls, overlay, decoration };
}
