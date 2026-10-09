# Build the Angular app, serve it with nginx and proxy /api to the backend.
#
# Build context is this repository's root:
#   docker build -f docker/Dockerfile -t carbon-frontend .
# The full local stack (SQL Server, Redis, MinIO, API, workers, this image) is defined in
# carbon_platform_new/docker-compose.yml, which builds this Dockerfile with context ../carbon_project_frontend.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
