FROM node:24-alpine
WORKDIR /app
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts --no-package-lock pg@8.16.3
RUN mkdir /ldap && chown node:node /ldap
COPY server.mjs protocol.mjs dashboards.mjs dashboard-panels.mjs technical-dashboards.mjs ldap-config.mjs ldap-bridge.mjs stations.mjs stations.html stations.css stations.js ./
USER node
CMD ["node", "server.mjs"]
