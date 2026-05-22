FROM node:22-alpine
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json README.md ./
COPY src ./src
COPY real_world_examples/nextjs ./real_world_examples/nextjs
RUN npm ci && npm run build
WORKDIR /workspace/real_world_examples/nextjs
RUN npm install
CMD ["npm", "start"]
