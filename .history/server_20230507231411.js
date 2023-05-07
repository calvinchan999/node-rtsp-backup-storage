"use strict";
require("dotenv/config");
const express = require("express");
const bodyParser = require("body-parser");
const config = require("./config/config");
const VideoStreamProcessor = require("./videoStreamProcessor.js");
const axios = require("axios");
const cron = require("node-cron");
const { BlobServiceClient } = require("@azure/storage-blob");

const port = config.port;

const app = express();

const blobServiceClient = BlobServiceClient.fromConnectionString(
  config.azureStorageAccount.connectionString
);
const containerClient = blobServiceClient.getContainerClient(
  config.azureStorageAccount.container
);
const videoStreamProcessor = new VideoStreamProcessor(containerClient);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

async function init() {
  // const blobServiceClient = BlobServiceClient.fromConnectionString(
  //   config.azureStorageAccount.connectionString
  // );
  // const containerClient = blobServiceClient.getContainerClient(
  //   config.azureStorageAccount.container
  // );
  // this.videoStreamProcessor = new VideoStreamProcessor(containerClient);

  // setInterval(async () => {
  //   const rtspServerRes = await getRtspApiResponse();
  //   if (rtspServerRes["data"]["items"].length <= 0) {
  //     videoStreamProcessor.stop();
  //   }
  //   const sources = [];
  //   for (const channelName in rtspServerRes.data.items) {
  //     sources.push({
  //       url: `${config.rtspProtocol}://${config.rtspServerUrl}/${channelName}`,
  //       name: channelName,
  //     });
  //   }
  //   videoStreamProcessor.setVideoSources(sources);
  //   console.log(videoStreamProcessor.getVideoSources());
  //   videoStreamProcessor.start();
  // }, 1000);

  cron.schedule("*/5 * * * * *", async () => {
    const rtspServerRes = await getRtspApiResponse();
    if (rtspServerRes["data"]["items"].length <= 0) {
      console.log("data <= l");
      videoStreamProcessor.stop();
    }

    const sources = [];
    for (const channelName in rtspServerRes.data.items) {
      if (channelName.indexOf(".1") <= -1) { // filter channel 1
        sources.push({
          url: `${config.rtspProtocol}://${config.rtspServerUrl}/${channelName}`,
          name: channelName,
        });
      }
    }
    videoStreamProcessor.setVideoSources(sources);
    console.log(videoStreamProcessor.getVideoSources());
    videoStreamProcessor.start();
  });

  cron.schedule("0 */1 * * *", async () => {
    console.log(`run uploadToBlobContainer ${new Date()}`);
    // await videoStreamProcessor.stop();
    await videoStreamProcessor.uploadToBlobContainer("./video");
  });

  // capure rtsp source and save to disk
  // cron.schedule("*/1 * * * * *", async () => {
  //   const rtspServerRes = await getRtspApiResponse();
  //   const sources = [];
  //   for (const channelName in rtspServerRes.data.items) {
  //     sources.push({
  //       url: `${config.rtspProtocol}://${config.rtspServerUrl}/${channelName}`,
  //       name: channelName,
  //     });
  //   }
  //   videoStreamProcessor.setVideoSources(sources);
  //   // console.log(videoStreamProcessor.getVideoSources());
  //   videoStreamProcessor.start();
  // });
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
  console.log(
    `server is running on http://localhost:${process.env.PORT || port}`
  );
});

// Handle close event
server.on("close", () => {
  // Clean up resources, such as closing database connections
  console.log("Express server closed");
});

// Handle exit event
process.on("exit", (code) => {
  // Clean up resources
  console.log(`Process exited with code ${code}`);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT signal. Closing server...");
  server.close(async () => {
    console.log("Server closed. Exiting process...");
    await videoStreamProcessor.stop();
    process.exit();
  });
});
