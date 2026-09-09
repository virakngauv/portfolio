import http from 'node:http';

// Keep the real hostname in the request URL (and therefore in Host), while
// connecting only to the local gateway. XHR polling can overwrite Host overrides.
// This agent is used by local smoke clients only, never by the production gateway.
export function createLoopbackAgent(expectedHost) {
  return new http.Agent({
    lookup(host, options, callback) {
      if (host !== expectedHost) {
        callback(new Error(`Unexpected smoke-test hostname: ${host}`));
        return;
      }
      if (options.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
      else callback(null, '127.0.0.1', 4);
    },
  });
}
// Posted by ChatGPT Chat on behalf of @virakngauv.
