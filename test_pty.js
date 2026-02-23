const pty = require('node-pty');
const os = require('os');

const ptyProcess = pty.spawn(os.platform() === 'win32' ? 'powershell.exe' : 'bash', [], {
    name: 'xterm-color',
    cols: 120,
    rows: 30,
    cwd: process.cwd(),
});

ptyProcess.onData((data) => {
    process.stdout.write(data);
});

ptyProcess.onExit(({ exitCode }) => {
    console.log(`Process exited with ${exitCode}`);
});

setTimeout(() => {
    ptyProcess.write('gemini \r');
}, 1000);

setTimeout(() => {
    ptyProcess.write('hello testing shift tab submission\x1b[Z');
}, 5000);

setTimeout(() => {
    // exit
    ptyProcess.write('\x03'); // ctrl-c
    process.exit(0);
}, 10000);
