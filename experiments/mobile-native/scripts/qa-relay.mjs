// Real WebCrypto interoperability with the production host protocol. Local QA only.
import { createRequire } from 'node:module';
import { createHostHandshake, generateEcdhKeyPair, exportPublicKeyJwk } from '../../../packages/web/server/lib/relay/e2ee.js';
import { createTunnelHost } from '../../../packages/web/server/lib/relay/tunnel-host.js';
import { decodeFrameBatch, encodeFrameBatch } from '../../../packages/web/server/lib/relay/tunnel-codec.js';
const { WebSocketServer } = createRequire(new URL('../../../packages/web/package.json', import.meta.url))('ws');

export async function startQaRelay(port, localPort) {
  const keys = await generateEcdhKeyPair();
  const server = new WebSocketServer({ host: '127.0.0.1', port });
  let handshakes = 0;
  server.on('connection', socket => {
    const handshake = createHostHandshake(keys.privateKey);
    let channel = null; let batched = false;
    let sends = Promise.resolve(); let receives = Promise.resolve();
    const tunnel = createTunnelHost({ connectionId: 'native-qa', getLocalPort: () => localPort, getBufferedAmount: () => socket.bufferedAmount, sendFrame(frame) { sends = sends.then(async () => { if (channel && socket.readyState === 1) socket.send(await channel.encryptor.encrypt(batched ? encodeFrameBatch([frame]) : frame)); }); return sends; } });
    socket.on('message', (bytes, binary) => {
      receives = receives.then(async () => {
        if (!binary) {
          const action = await handshake.handleText(bytes.toString());
          if (action.type === 'established') { channel = action.channel; batched = action.batch; handshakes++; if (action.replyText) socket.send(action.replyText); }
          else if (action.type === 'send-text') socket.send(action.text);
          return;
        }
        if (!channel) throw new Error('Unestablished fixture relay');
        const plain = await channel.decryptor.decrypt(bytes);
        for (const frame of batched ? decodeFrameBatch(plain) : [plain]) await tunnel.handleFrame(frame);
      }).catch(() => socket.close(1011, 'Fixture transport failed'));
    });
    socket.on('close', () => tunnel.close());
  });
  return { publicKey: await exportPublicKeyJwk(keys.publicKey), handshakes: () => handshakes, close() { for (const socket of server.clients) socket.close(); server.close(); } };
}
