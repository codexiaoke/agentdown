# syntax=docker/dockerfile:1
FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node examples/model-server/package.json examples/model-server/package-lock.json ./examples/model-server/
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --prefix examples/model-server --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node examples/model-server/server.mjs examples/model-server/deepseek.mjs ./examples/model-server/
# Build the real-mode prototype first: npm run build:live
COPY --chown=node:node dist-next/prototype ./dist-next/prototype
ENV HOST=0.0.0.0 PORT=8011 AGENTDOWN_STATIC_DIR=/app/dist-next/prototype AGENTDOWN_DATA_DIR=/data
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8011
CMD ["node", "examples/model-server/server.mjs"]
