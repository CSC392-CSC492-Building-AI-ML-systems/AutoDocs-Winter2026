# Use a Node.js base image
FROM node:20-alpine AS development
# Install necessary packages (like libc6-compat for Next.js on alpine)
RUN apk add --no-cache libc6-compat
# Set the working directory inside the container
WORKDIR /app
# Copy package.json and package-lock.json and install dependencies
COPY package*.json ./
RUN npm install
# Copy the rest of the application code
COPY . .
# Expose the port Next.js runs on (default 3000)
EXPOSE 3000
# Command to run the development server
CMD ["npm", "run", "dev"]
