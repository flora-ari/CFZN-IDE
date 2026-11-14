import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export interface Command {
  executable: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv;
  timeoutMs: number; signal?: AbortSignal;
  output?: (stream: 'stdout' | 'stderr', text: string) => void;
}
export interface CommandResult {
  code: number | null; signal: string | null; stdout: string; stderr: string;
  cancelled: boolean; timedOut: boolean;
}

/** Only this invocation's PID tree/group is terminated. Never use shell command strings. */
export function runCommand(command: Command): Promise<CommandResult> {
  if (command.signal?.aborted) return Promise.resolve({ code: null, signal: null, stdout: '', stderr: '', cancelled: true, timedOut: false });
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd, env: command.env, shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', cancelled = false, timedOut = false;
    let stopping: Promise<void> | undefined;
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
    function output(stream: 'stdout' | 'stderr', value: string) {
      command.output?.(stream, value);
      // Startup JSON/diagnostics are bounded too; jobs retain their own tail log.
      if (stream === 'stdout') stdout = (stdout + value).slice(-(1024 ** 2));
      else stderr = (stderr + value).slice(-(1024 ** 2));
    }
    child.stdout.on('data', (data: Buffer) => output('stdout', decoders.stdout.write(data)));
    child.stderr.on('data', (data: Buffer) => output('stderr', decoders.stderr.write(data)));
    function stop() {
      if (stopping || !child.pid) return;
      const pid = child.pid;
      stopping = process.platform === 'win32' ? new Promise<void>((done, fail) => {
        const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true });
        killer.on('error', fail);
        killer.on('close', () => done());
      }) : Promise.resolve().then(() => {
        try { process.kill(-pid, 'SIGKILL'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
      });
      // Report failures while keeping the task non-terminal until the child actually closes.
      void stopping.catch((error: Error) => output('stderr', `Process-tree termination failed: ${error.message}\n`));
    }
    const abort = () => { cancelled = true; stop(); };
    command.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; stop(); }, command.timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      command.signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      command.signal?.removeEventListener('abort', abort);
      output('stdout', decoders.stdout.end()); output('stderr', decoders.stderr.end());
      void (stopping ?? Promise.resolve()).catch(() => undefined).then(() =>
        resolve({ code, signal, stdout, stderr, cancelled, timedOut }));
    });
    if (command.signal?.aborted) abort();
  });
}
