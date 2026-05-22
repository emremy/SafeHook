FROM node:22-alpine
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json README.md ./
COPY src ./src
COPY real_world_examples/fastify ./real_world_examples/fastify
RUN npm ci && npm run build
WORKDIR /workspace/real_world_examples/fastify
RUN npm install
CMD ["npm", "start"]
