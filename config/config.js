require("dotenv/config");
const config = {
  port: 5000,
  httpProtocol: "http",
  rtspProtocol: "rtsp",
  rtspServerUrl:
    process.env.RTSP_SERVER_URL ?? "media-vm.australiaeast.cloudapp.azure.com",
  rtspApiServerUrl:
    process.env.RTSP_API_SERVER_URL ?? "127.0.0.1:9997",
  azureStorageAccount: {
    connectionString:
      process.env.CONNECTION_STRING ??
      "DefaultEndpointsProtocol=https;AccountName=devstgeacct;AccountKey=vZcNu8pCri5kX7rpBeHe+g9EbvX3ADRbFtA6G1jJvi/iECao9IlgAWbcC5qNhmnvGEdf5jSypfdp+AStk4Elvw==;EndpointSuffix=core.windows.net",
    container: process.env.AZURE_CONTAINER ?? "stream",
    azureBlobToken:
      process.env.AZURE_BLOB_TOKEN ??
      "sp=racwdli&st=2023-04-03T03:27:53Z&se=2050-03-04T11:27:53Z&spr=https&sv=2021-12-02&sr=c&sig=Bn6FMpyd0rWNU8nKGEAMuZzq72GvWWvo78HT3EMP9NA%3D",
    azureBlobUrl:
      process.env.AZURE_BLOB_URL ??
      "https://devstgeacct.blob.core.windows.net/stream?sp=racwdli&st=2023-04-03T03:27:53Z&se=2050-03-04T11:27:53Z&spr=https&sv=2021-12-02&sr=c&sig=Bn6FMpyd0rWNU8nKGEAMuZzq72GvWWvo78HT3EMP9NA%3D",
  },
};
module.exports = config;
