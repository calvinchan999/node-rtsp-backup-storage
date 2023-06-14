require("dotenv/config");
const winston = require("winston");
const azureBlobTransport = require("winston3-azureblob-transport");
const config = require("../config/config");
// const logger = winston.createLogger({
//   level: "error",
//   format: winston.format.json(),
//   transports: [
//     // new AzureBlobTransport({
//     //   accountName: "<your-account-name>",
//     //   accountKey: "<your-account-key>",
//     //   containerName: "<your-container-name>",
//     //   blobName: "<your-blob-name>",
//     //   level: "info",
//     // }),
//   ],
// });

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    // new winston.transports.File({ filename: "error.log", level: "error" }),
    // new winston.transports.File({ filename: "combined.log" }),
    new azureBlobTransport({
      account: {
        name: config.log.azureStorageName,
        key: config.log.azureStorageKey,
      },
      containerName: config.log.azureContainerName,
      blobName: "log",
      level: "info",
      bufferLogSize: 1,
      syncTimeout: 0,
      rotatePeriod: "YYYY-MM-DD",
      eol: "\n",
    }),
  ],
});

logger.add(
  new winston.transports.Console({
    format: winston.format.simple(),
  })
);

module.exports = logger;
