// Server Manager for Clumo Electron
// Starts and stops the embedded Node.js server as a child process

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

class ServerManager {
  constructor() {
    this.process = null;
    this.port = null;
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

    // In production (packaged), server is in resources/server/
    // In development, it's at ../server/
    const isDev = !process.resourcesPath || process.argv.includes('--dev');
    const serverPath = isDev
      ? path.join(__dirname, '..', 'server', 'index.js')
      : path.join(process.resourcesPath, 'server', 'index.js');

    return new Promise((resolve, reject) => {
      // Use spawn with system node instead of fork (avoids Electron's
      // bundled Node issues with native modules like better-sqlite3)
      this.process = spawn('node', [serverPath], {
        env: {
          ...process.env,
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
      const maxAttempts = 50; // 10 seconds total
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
        setTimeout(checkHealth, 200);
      };

      // Give the server a moment to initialize before first check
      setTimeout(checkHealth, 1000);
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
