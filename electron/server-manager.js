// Server Manager for Clumo Electron
// Starts and stops the embedded Node.js server as a child process

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

class ServerManager {
  constructor(options = {}) {
    this.process = null;
    this.port = null;
    // Optional overrides — primarily for tests.
    // `serverEntry`: absolute path to the server entry JS to spawn.
    // `nodeBin`: node executable (defaults to "node" on PATH).
    // `extraEnv`: extra env vars merged into the spawned process env.
    this.serverEntry = options.serverEntry || null;
    this.nodeBin = options.nodeBin || 'node';
    this.extraEnv = options.extraEnv || {};
    this.healthTimeoutMs = options.healthTimeoutMs || 10000;
    this.healthPollIntervalMs = options.healthPollIntervalMs || 200;
  }

  // Find an available port
  async findPort() {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      server.on('error', reject);
    });
  }

  async start() {
    this.port = await this.findPort();

    // Resolve the server entry path: explicit override (tests) > prod > dev.
    let serverPath;
    const isDev = !process.resourcesPath || process.argv.includes('--dev');
    if (this.serverEntry) {
      serverPath = this.serverEntry;
    } else {
      serverPath = isDev
        ? path.join(__dirname, '..', 'server', 'index.js')
        : path.join(process.resourcesPath, 'server', 'index.js');
    }

    // In a packaged build, Chromium ships inside the bundled server node_modules
    // (installed with PLAYWRIGHT_BROWSERS_PATH=0). Tell Playwright to resolve it there.
    // In dev we leave the default shared browser cache untouched.
    const playwrightEnv = (!isDev && !process.env.PLAYWRIGHT_BROWSERS_PATH)
      ? { PLAYWRIGHT_BROWSERS_PATH: '0' }
      : {};

    return new Promise((resolve, reject) => {
      // Use spawn with system node instead of fork (avoids Electron's
      // bundled Node issues with native modules like better-sqlite3)
      this.process = spawn(this.nodeBin, [serverPath], {
        env: {
          ...process.env,
          ...playwrightEnv,
          ...this.extraEnv,
          PORT: String(this.port)
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      });

      this.process.stdout.on('data', (data) => {
        console.log(`[Server] ${data.toString().trim()}`);
      });

      this.process.stderr.on('data', (data) => {
        console.error(`[Server] ${data.toString().trim()}`);
      });

      this.process.on('error', (err) => {
        console.error('[ServerManager] Process error:', err);
        reject(err);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[ServerManager] Server exited with code ${code}, signal ${signal}`);
        this.process = null;
      });

      // Poll the health endpoint until the server is ready
      const maxAttempts = Math.ceil(this.healthTimeoutMs / this.healthPollIntervalMs);
      let attempts = 0;
      let resolved = false;

      const checkHealth = () => {
        if (resolved) return;
        attempts++;
        fetch(`http://localhost:${this.port}/health`, { signal: AbortSignal.timeout(5000) })
          .then(res => res.json())
          .then(data => {
            if (resolved) return;
            if (data.status === 'ok') {
              resolved = true;
              resolve();
            } else {
              retry();
            }
          })
          .catch(() => retry());
      };

      const retry = () => {
        if (resolved) return;
        if (attempts >= maxAttempts) {
          resolved = true;
          reject(new Error('Server failed to start within timeout'));
          return;
        }
        setTimeout(checkHealth, this.healthPollIntervalMs);
      };

      // Give the server a moment to initialize before first check
      setTimeout(checkHealth, Math.min(this.healthPollIntervalMs * 5, 1000));
    });
  }

  getPort() {
    return this.port;
  }

  stop() {
    if (this.process) {
      const proc = this.process;
      this.process = null;
      proc.kill('SIGTERM');

      // Force kill if the process hasn't exited after 5 seconds
      const forceKillTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
          console.warn('[ServerManager] Server did not exit gracefully, sent SIGKILL');
        } catch (e) {
          // Process already exited
        }
      }, 5000);

      proc.on('exit', () => clearTimeout(forceKillTimer));
    }
  }
}

module.exports = ServerManager;
