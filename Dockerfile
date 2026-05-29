# =========================
# Stage 1: 前端 build
# =========================
FROM node:20-alpine AS frontend-build

# 默认官方源；国内部署时由 docker-compose build args 覆盖成镜像源
ARG NPM_REGISTRY=https://registry.npmjs.org

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm config set registry "$NPM_REGISTRY" && npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build


# =========================
# Stage 2: Python 运行时
# =========================
FROM python:3.12-slim

# 默认官方源；国内部署时由 docker-compose build args 覆盖成镜像源
ARG PIP_INDEX_URL=https://pypi.org/simple

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -i "$PIP_INDEX_URL" -r requirements.txt

# 后端代码
COPY *.py ./

# 前端 build 产物
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# 数据目录（volume 挂这里）
RUN mkdir -p /data/photos

ENV DATABASE_PATH=/data/food_map.db
ENV PHOTOS_DIR=/data/photos
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
