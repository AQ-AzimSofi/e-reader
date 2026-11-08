/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "yomi-sapo",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          region: "ap-northeast-1",
        },
      },
    };
  },
  async run() {
    // Use SSM parameters directly (easier to set via AWS CLI)
    const stage = $app.stage;
    const ssmPrefix = `${$app.name}-${stage}`;

    const geminiApiKey = await aws.ssm.getParameter({
      name: `${ssmPrefix}-GEMINI_API_KEY`,
      withDecryption: true,
    });
    const authPasswordHash = await aws.ssm.getParameter({
      name: `${ssmPrefix}-AUTH_PASSWORD_HASH`,
      withDecryption: true,
    });
    const databaseUrl = await aws.ssm.getParameter({
      name: `${ssmPrefix}-DATABASE_URL`,
      withDecryption: true,
    });
    const googleTranslateApiKey = await aws.ssm.getParameter({
      name: `${ssmPrefix}-GOOGLE_TRANSLATE_API_KEY`,
      withDecryption: true,
    });
    const googleTtsApiKey = await aws.ssm.getParameter({
      name: `${ssmPrefix}-GOOGLE_TTS_API_KEY`,
      withDecryption: true,
    });
    const sessionSecret = await aws.ssm.getParameter({
      name: `${ssmPrefix}-SESSION_SECRET`,
      withDecryption: true,
    });

    // Audiobook recordings. Private: the app hands out short-lived presigned URLs
    // so a purchased recording is never reachable without a signed-in session.
    const narrationAudio = new sst.aws.Bucket("NarrationAudio");

    const web = new sst.aws.Nextjs("YomiSapo", {
      openNextVersion: "3.4.1",
      link: [narrationAudio],
      environment: {
        NARRATION_AUDIO_BUCKET: narrationAudio.name,
        GEMINI_API_KEY: geminiApiKey.value,
        AUTH_PASSWORD_HASH: authPasswordHash.value,
        DATABASE_URL: databaseUrl.value,
        POSTGRES_URL: databaseUrl.value,
        GOOGLE_TRANSLATE_API_KEY: googleTranslateApiKey.value,
        GOOGLE_TTS_API_KEY: googleTtsApiKey.value,
        SESSION_SECRET: sessionSecret.value,
      },
      warm: 1,
    });

    // AWS now requires lambda:InvokeFunction as well as lambda:InvokeFunctionUrl
    // for function URLs created after its 2025 change; sst 3.9.37 grants only the
    // latter, so a fresh stack answers every request with 403. Its @pulumi/aws
    // (6.66.2) cannot scope this grant with invokedViaFunctionUrl. Debt: drop this
    // once sst is upgraded past sst#6571, which adds the scoped permission itself.
    // Under `sst dev` the app runs locally and no server function exists.
    if ($dev) return { url: web.url };
    const server = web.nodes.server;
    if (!server) throw new Error("sst Nextjs did not create a server function");
    new aws.lambda.Permission("YomiSapoServerPublicInvoke", {
      action: "lambda:InvokeFunction",
      function: server.apply((fn) => fn.nodes.function.name),
      principal: "*",
    });

    return {
      url: web.url,
    };
  },
});
