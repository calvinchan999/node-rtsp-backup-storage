"use strict";
// Import required dependencies
const { spawn, exec } = require("child_process");
const fs = require("fs");
const moment = require("moment");

// Define VideoStreamProcessor class
class VideoStreamProcessor {
  // Define class properties
  threadQueue;
  videoSources;
  processingVideos;
  blobContainerClient;
  videoFilename;
  videoFolderPath;

  // Constructor
  constructor(blobContainerClient) {
    this.blobContainerClient = blobContainerClient;
    this.threadQueue = [];
    this.videoSources = [];
    this.processingVideos = new Set();
  }

  async uploadToBlobContainer(videoFolderPath) {
    console.log("uploadtoblobcontainer");
    const directorys = await fs.promises.readdir(videoFolderPath);

    for (const directory of directorys) {
      const files = await fs.promises.readdir(
        videoFolderPath + "/" + directory
      );
      let total = files.length - 1;

      // for (const file of files) {
        for(let i = 0 ;i<total ; i++) {
   
        if (files[i]) {
          const blobName = `${directory}/${files[i]}`;
          const blobClient = await this.blobContainerClient.getBlobClient(blobName);
          const blockBlobClient = await blobClient.getBlockBlobClient();
          const readStream = await fs.createReadStream(
            videoFolderPath + "/" + directory + "/" + files[i]
          );
          const uploadOptions = {
            bufferSize: 4 * 1024 * 1024,
            maxBuffers: 20,
          };

          const uploadPromise = blockBlobClient.uploadStream(
            readStream,
            uploadOptions.bufferSize,
            uploadOptions.maxBuffers,
            {
              blobHTTPHeaders: {
                blobContentType: "video/MP2T",
              },
              metadata: {
                source: "rtsp",
              },
            }
          );

          readStream.on("end", async () => {
            console.log(`uploaded ${files[i]} to azure blob container`);
            try {
              await fs.unlinkSync(
                videoFolderPath + "/" + directory + "/" + files[i]
              );
            } catch (e) {
              console.log(`remove ${files[i]} failed!`);
            }
          });

          await uploadPromise;
        }
      }
    }
    // await this.stop();
  }

  async start() {
    for (const rtspSource of this.videoSources) {
      if (this.processingVideos.has(rtspSource.name)) {
        console.log(`${rtspSource.name} is already being processed`);
        continue;
      }

      // Create video folder
      const videoFolderPath = `./video/${rtspSource.name}`;
      console.log(videoFolderPath);
      if (!fs.existsSync(videoFolderPath)) {
        fs.mkdirSync(videoFolderPath);
      }

      // Create video thread
      const process = spawn(
        "ffmpeg",
        [
          "-rtsp_transport",
          "tcp",
          "-i",
          rtspSource.url,
          "-reset_timestamps",
          "1",
          "-metadata",
          `title=${rtspSource.name}_${moment().format("YYYY-MM-DD_HH:mm:ss")}`,
          "-an",
          "-f",
          "segment",
          "-segment_time",
          "1800",
          "-segment_format",
          "mpegts",
          "-strftime",
          "1",
          `${videoFolderPath}/${rtspSource.name}_%Y-%m-%d_%H-%M-%S.ts`,
        ],
        { detached: true, stdio: "ignore" }
      );

      process.channelName = rtspSource.name;

      process.unref();

      // Add video to processing list
      this.processingVideos.add(rtspSource.name);

      // Add listener for process exit event
      process.on("exit", async (code, signal) => {
        console.log(
          `Process ${process.channelName} has exited with code ${code} and signal ${signal}`
        );
        this.processingVideos.delete(process.channelName);
        const videoSources = this.getVideoSources();
        const filteredSources = videoSources.filter(
          (source) => source.name !== process.channelName
        );
        this.setVideoSources(filteredSources);
      });

      // Add thread to thread queue
      // { channelName: rtspSource.name }
      this.threadQueue.push(process);
    }
  }

  // async stopName(channel) {
  //   const thread = this.threadQueue.find(
  //     (thread) => thread.channelName === channel
  //   );
  //   if (thread) {
  //     thread.kill();
  //     try {
  //       if (process.platform === "win32") {
  //         // Windows-specific code goes here
  //         const terminateProcess = (pid) => {
  //           return new Promise((resolve, reject) => {
  //             exec(`taskkill /pid ${pid} /T /F`, (error, stdout, stderr) => {
  //               if (error) {
  //                 reject(error);
  //               } else {
  //                 resolve();
  //               }
  //             });
  //           });
  //         };
  //         terminateProcess(thread.pid);
  //       } else {
  //         // Non-Windows-specific code goes here
  //         process.kill(thread.pid, "SIGKILL");
  //       }
  //     } catch (e) {
  //       console.log("The process not found or deleted");
  //     }
  //     await this.processingVideos.delete(channel);
  //     const videoSources = await this.getVideoSources();
  //     const filteredSources = videoSources.filter(
  //       (source) => source.name === channel
  //     );
  //     await this.setVideoSources(filteredSources);
  //   }
  // }

  async stop() {
    for (const thread of this.threadQueue) {
      // const pid = this.processingVideos.get(thread.args[5]);
      if (thread) {
        console.log(`kill ${thread.pid}`);
        console.log(`kill ${thread.channelName}`);
        thread.kill();
        if (process.platform === "win32") {
          // Windows-specific code goes here
          const terminateProcess = (pid) => {
            return new Promise((resolve, reject) => {
              exec(`taskkill /pid ${pid} /T /F`, (error, stdout, stderr) => {
                if (error) {
                  reject(error);
                } else {
                  resolve();
                }
              });
            });
          };
          terminateProcess(thread.pid);
        } else {
          // Non-Windows-specific code goes here
          process.kill(thread.pid, "SIGKILL");
        }
      }
    }

    // Clear processing videos
    await this.processingVideos.clear();
    await this.setThreadQueue([]);
    await this.setVideoSources([]);
  }

  setThreadQueue(queue) {
    this.threadQueue = queue;
  }

  setVideoSources(sources) {
    this.videoSources = sources;
  }

  getVideoSources() {
    return this.videoSources;
  }
}

module.exports = VideoStreamProcessor;
