const WebSocket = require("ws");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

const speech = require("@google-cloud/speech");
const client = new speech.SpeechClient();

let phoneNumber = "+8801977479548";
let languageCode = "en-GB";
let prevTranscription = ""; 
let partialTranscription = ""; 

app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true })); 

//Configure Transcription Request
const request = {
  config: {
    encoding: "MULAW",
    sampleRateHertz: 8000,
    languageCode: languageCode
  },
  interimResults: true
};


app.post("/setLanguageCode", (req, res) => {
  const newLanguageCode = req.body.languageCode;
  if (newLanguageCode) {
    languageCode = newLanguageCode;
    request.config.languageCode = languageCode; // Update the language code in the request object
    res.status(200).send("Language code updated successfully");
    console.log("Language updated to", languageCode);
      
  } else {
    res.status(400).send("Invalid language code");
  }
});


app.post("/setPhoneNumber", (req, res) => {
  const newPhoneNumber = req.body.phoneNumber;
  if (newPhoneNumber) {
    phoneNumber = newPhoneNumber;
    res.status(200).send("Phone number updated successfully");
    console.log("Phone number updated to ", phoneNumber);
  } else {
    res.status(400).send("Invalid phone number");
  }
});


// Handle Web Socket Connection
wss.on("connection", function connection(ws) {
    console.log("New Connection Initiated");
    
    let recognizeStream = null;

    ws.on("message", function incoming(message) {
        const msg = JSON.parse(message);
        switch (msg.event) {
            case "connected":
                console.log(`A new call has connected.`);
                recognizeStream = client
                    .streamingRecognize(request)
                    .on("error", console.error)
                    .on("data", (data) => {
                        const transcription = data.results[0].alternatives[0].transcript;
                        partialTranscription += transcription; // Accumulate partial transcription
                        if (!data.results[0].isFinal) {
                            // If the transcription is not final, wait for next segment
                            return;
                        }
                        // Check if transcription is different from previous one
                        if (partialTranscription !== prevTranscription) {
                            console.log("Transcribed text:", partialTranscription);
                            wss.clients.forEach((client) => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify(partialTranscription));
                                }
                            });
                            prevTranscription = partialTranscription; // Update previous transcription
                        }
                        partialTranscription = ""; // Reset partial transcription
                    });
                break;
            case "start":
                console.log(`Starting Media Stream ${msg.streamSid}`);
                break;
            case "media":
                if (recognizeStream) {
                    recognizeStream.write(msg.media.payload);
                }
                break;
            case "stop":
                console.log(`Call has ended`);
                if (recognizeStream) {
                    recognizeStream.destroy();
                }
                break;
        }
    });
});



app.post("/", (req, res) => {
  res.set("Content-Type", "text/xml");

  res.send(`
    <Response>

     <Start>
        <Stream url="wss://${req.headers.host}" track="outbound_track"/>
    </Start>

    <Dial callerId="+12706979960">
        <Number>${phoneNumber}</Number>
    </Dial>
    </Response>

  `);
});

console.log("Listening at Port 8080");
server.listen(8080);
