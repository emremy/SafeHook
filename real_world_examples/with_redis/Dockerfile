FROM node:22-alpine
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json README.md ./
COPY src ./src
COPY real_world_examples/with_redis ./real_world_examples/with_redis
RUN npm ci && npm run build
WORKDIR /workspace/real_world_examples/with_redis
RUN npm install
CMD ["npm", "start"]
