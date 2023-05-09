"use strict";
// Import required dependencies
const { spawn, exec } = require("child_process");
const fs = require("fs");
const moment = require("moment");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");

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

  /**
   * Uploads video files from the specified folder to Azure Storage and deletes local files.
   * @param {string} videoFolderPath - The folder path where the video files are located.
   **/

  async uploadToBlobContainer(videoFolderPath) {
    console.log("uploadtoblobcontainer");

    const directorys = await fs.promises.readdir(videoFolderPath);

    for (const directory of directorys) {
      const files = await fs.promises.readdir(
        videoFolderPath + "/" + directory
      );

      // let total = files.length > 1 ? files.length - 1 : files.length;
      const mp4Files = files.filter((file) => file.endsWith(".mp4"));

      for (const file of mp4Files) {
        if (file) {
          const blobName = `${directory}/${file}`;
          const blobClient = await this.blobContainerClient.getBlobClient(
            blobName
          );
          const blockBlobClient = await blobClient.getBlockBlobClient();
          const readStream = await fs.createReadStream(
            videoFolderPath + "/" + directory + "/" + file
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
                blobContentType: "video/mp4", // video/MP2T
              },
              metadata: {
                source: file,
              },
            }
          );

          readStream.on("end", async () => {
            console.log(`uploaded ${file} to azure blob container`);
            try {
              await fs.unlinkSync(
                videoFolderPath + "/" + directory + "/" + file
              );
            } catch (e) {
              console.log(`remove ${file} failed!`);
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
      // mpeg-ts
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

        const files = await fs.promises.readdir(
          "./video/" + process.channelName
        );

        const tsFiles = files.filter((file) => file.endsWith(".ts"));

        for (const file of tsFiles) {
          const fileNameWithoutExtension = path.parse(file).name;

          const inputName = `./video/${process.channelName}/${file}`;
          const outputName = `./video/${
            process.channelName
          }/${fileNameWithoutExtension}_${moment().format(
            "YYYY-MM-DD_HH-mm-ss"
          )}.mp4`;

          await ffmpeg(inputName)
            .outputOptions("-c:v", "libx264")
            .outputOptions("-movflags", "+faststart")
            .output(outputName)
            .on("end", () => {
              console.log("Conversion complete");
              fs.unlinkSync(inputName);
            })
            .on("error", (err) => {
              console.log(`Conversion error: ${err.message}`);
              fs.unlinkSync(inputName);
            })
            .run();
        }

        await this.processingVideos.delete(process.channelName);

        const videoSources = this.getVideoSources();
        const filteredSources = videoSources.filter(
          (source) => source.name !== process.channelName
        );
        await this.setVideoSources(filteredSources);
        await this.terminateProcessByName(process.channelName);
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

  async terminateProcessByName(channelName) {
    const thread = this.threadQueue.find(
      (data) => data.channelName === channelName
    );
    if (thread) {
      console.log(`kill ${thread.pid}`);
      console.log(`kill ${thread.channelName}`);
      thread.kill();
      if (process.platform === "win32") {
        // Windows-specific code goes here
        const terminateProcess = (pid) => {
          return new Promise((resolve, reject) => {
            exec(`tasklist /fi "PID eq ${pid}"`, (error, stdout, stderr) => {
              if (error) {
                reject(error);
              } else {
                const isRunning =
                  stdout.toLowerCase().indexOf(`pid: ${pid}`) !== -1;
                if (isRunning) {
                  exec(
                    `taskkill /pid ${pid} /T /F`,
                    (error, stdout, stderr) => {
                      if (error) {
                        reject(error);
                      } else {
                        resolve();
                      }
                    }
                  );
                } else {
                  resolve();
                }
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

  async stop() {
    for (const thread of this.threadQueue) {
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
