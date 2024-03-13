# builder image
FROM node:20.11.0-alpine3.19 AS builder

ENV NODE_APP_PATH=/app
USER node

WORKDIR ${NODE_APP_PATH}

COPY package*.json ./
COPY .npmrc ./

RUN npm clean-install --omit=optional

COPY --chown=node:node . .

RUN npm run build

# production image
FROM node:20.11.0-alpine3.19

ENV NODE_APP_PATH=/app
ENV NODE_ENV=production

LABEL name="node-atuin-server"
LABEL description="Atuin node API server"

RUN adduser -D -u 12345 -h /home/nodeapp -s /bin/sh nodeapp && \
    addgroup -g 12321 nodedevs && addgroup nodeapp nodedevs

USER node

WORKDIR ${NODE_APP_PATH}

COPY --chown=node:node package*.json ./
COPY --chown=node:node .npmrc ./
COPY --chown=node:node --from=builder /home/node/.npm/ /home/node/.npm/
COPY --chown=node:node --from=builder ${NODE_APP_PATH}/dist ./dist/
COPY --chown=node:node ./openapi ./openapi
COPY --chown=node:node ./public ./public
COPY --chown=node:node ./views ./views
COPY --chown=node:node ./templates ./templates

RUN npm clean-install --omit=optional && \
    npm cache clean --force && \
    rm -rf /home/node/.npm

USER nodeapp

CMD [ "node", "dist/otel.js" ]
