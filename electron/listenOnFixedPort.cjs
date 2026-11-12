/**
 * Try a stable set of loopback ports in order. Each attempt owns its listeners so
 * a later EADDRINUSE cannot make stale handlers start multiple retries at once.
 */
function listenOnFixedPort(server, ports, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    let index = 0;
    const tryNext = () => {
      if (index >= ports.length) {
        reject(new Error('No free port'));
        return;
      }

      const port = ports[index++];
      const onListening = () => {
        server.off('error', onError);
        const address = server.address();
        resolve(address && typeof address !== 'string' ? address.port : port);
      };
      const onError = (error) => {
        server.off('listening', onListening);
        if (error && error.code === 'EADDRINUSE') tryNext();
        else reject(error);
      };

      server.once('listening', onListening);
      server.once('error', onError);
      server.listen(port, host);
    };

    tryNext();
  });
}

module.exports = { listenOnFixedPort };
