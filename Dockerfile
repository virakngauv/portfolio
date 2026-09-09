FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@11.9.0
COPY projects/ ./projects/
COPY scripts/install-games.mjs ./scripts/install-games.mjs
# Respect both upstream lockfiles. Install production dependencies, but never next build.
RUN node scripts/install-games.mjs

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies --chown=node:node /app/projects/ ./projects/
COPY --chown=node:node runtime/ ./runtime/
COPY --chown=node:node scripts/ ./scripts/
COPY --chown=node:node package.json ./package.json
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=3s --start-period=35s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/_runtime/healthz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "runtime/index.mjs"]
# Posted by ChatGPT Chat on behalf of @virakngauv.
