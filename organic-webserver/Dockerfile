FROM node:22

WORKDIR /organic-webserver
COPY package.json .
RUN npm install
COPY . .
CMD npm start