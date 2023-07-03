"use strict";
require("dotenv/config");
const logger = require("./winston/logger");
const express = require("express");
const bodyParser = require("body-parser");
const config = require("./config/config");
const VideoStreamProcessor = require("./videoStreamProcessor.js");
const axios = require("axios");
const cron = require("node-cron");
const { BlobServiceClient } = require("@azure/storage-blob");
const fs = require("fs");
const moment = require("moment");

const videosPath = "./video";

const port = config.port;

const app = express();

const blobServiceClient = BlobServiceClient.fromConnectionString(
  config.azureStorageAccount.connectionString
);
const containerClient = blobServiceClient.getContainerClient(
  config.azureStorageAccount.container
);
const videoStreamProcessor = new VideoStreamProcessor(
  containerClient,
  moment().tz(moment.tz.guess()).format("z")
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

async function init() {
  if (!fs.existsSync(videosPath)) {
    fs.mkdir(videosPath, (err) => {
      if (err) {
        logger.error(err);
      } else {
        logger.info("video folder created successfully.");
      }
    });
  }

  cron.schedule("*/5 * * * * *", async () => {
    const channels = await getRtspApiResponse();

    const mapper = (data) => {
      return new Promise((resolve, reject) => {
        const result = {};

        for (const key in data) {
          if (key.indexOf(".") !== -1) {
            const [prefix, suffix] = key.split(".");
            result[key] = data[key];

            if (
              result.hasOwnProperty(prefix + ".0") &&
              result.hasOwnProperty(prefix + ".1")
            ) {
              delete result[prefix + ".1"];
            }
          }
        }
        resolve(result);
      });
    };

    const channelsData = await mapper(channels.data.items);

    if (channelsData) {
      const sources = [];

      for (const channel in channelsData) {
        sources.push({
          url: `${config.rtspProtocol}://${config.rtspServerUrl}/${channel}`,
          name: channel,
        });
      }

      videoStreamProcessor.setVideoSources(sources);
      if (videoStreamProcessor.getVideoSources().length > 0) {
        // logger.info(videoStreamProcessor.getVideoSources());
        // console.log(videoStreamProcessor.getVideoSources());
        videoStreamProcessor.start();
      }
    }
  });


  cron.schedule("*/30 * * * *", async () => {
    videoStreamProcessor.updateCompletedVideo("./video");
  })

  cron.schedule("0 */1 * * *", async () => {
    logger.warn(`Upload To BlobContainer ${new Date()}`);
    await videoStreamProcessor.uploadToBlobContainer("./video");
  });

}

function getRtspApiResponse() {
  return new Promise((resolve, reject) => {
    axios
      .get(`${config.httpProtocol}://${config.rtspApiServerUrl}/v1/paths/list`)
      .then((res) => resolve(res))
      .catch((err) => reject(err));
  });
}

const server = app.listen(process.env.PORT || port, async () => {
  init();
  logger.info(`Server is running on ${process.env.PORT || port}`);
});

server.on("close", () => {
  // Clean up resources, such as closing database connections
  logger.info(`Server closed`);
});

process.on("exit", (code) => {
  // Clean up resources
  logger.info(`Process exited with code ${code}`);
});

process.on("SIGINT", () => {
  logger.info("Received SIGINT signal. Closing server...");
  server.close(() => {
    logger.info("Server closed. Exiting process...");
    videoStreamProcessor.stop();
    process.exit();
  });
});

app.get("/", (req, res) => {
  res.send("server is running!");
});
