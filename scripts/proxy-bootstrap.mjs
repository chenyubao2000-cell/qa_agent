import { bootstrap } from 'global-agent';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

bootstrap();

const proxy = process.env.GLOBAL_AGENT_HTTP_PROXY
  || process.env.HTTPS_PROXY
  || process.env.HTTP_PROXY;

if (proxy) {
  setGlobalDispatcher(new ProxyAgent({
    uri: proxy,
    connect: { rejectUnauthorized: false }
  }));
}
