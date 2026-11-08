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
      domain: stage === "production" ? "yomi-sapo.click" : undefined,
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

    return {
      url: web.url,
    };
  },
});
