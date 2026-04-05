FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Copiar arquivos do projeto
COPY . .

EXPOSE 5173

# Rodar no modo desenvolvimento com host 0.0.0.0
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
