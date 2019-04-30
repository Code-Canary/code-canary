const request = require("request");
const Flickr = require('flickrapi');
const flickrOptions = {
    api_key: "a260c2cc20d55d630365fbc4c8b1c9b6",
    secret: "ef0e017684ae9935"
};

const { quickReply } = require('../service/messageTemplates');

var User = require("../dao/models/user");
var { Lesson } = require("../dao/models/lesson");
var { Question } = require("../dao/models/question");

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const MessageTemplates = require('./messageTemplates');
const getRawContents = require('../render/html-formatter').getRawContents;

const { runLesson } = require('../interpreter/index');

async function handleMessage(sender_psid, received_message) {

    let response;
    var postbackResponse = {};

    getRawContents(sender_psid, null);

    if (received_message.text) {
        // Create the payload for a basic text message, which will be added to the body of our request to the Send API
        response = await runLesson(sender_psid, received_message);
    }

    if (response.type === 'informative') {
        setTimeout(() => {
            handleMessage(sender_psid, received_message);
        }, 1000);
    }
    // else if (received_message.attachments) {
    //     // Get the URL of the message attachment
    //     // let attachment_url = received_message.attachments[0].payload.url;
    //     response = constructTemplateResponse('Nothing');
    // }

    // console.log("WTF");
    postbackResponse = constructResponseMessage(sender_psid, response.response)
    console.log(postbackResponse);
    // Send the message to acknowledge the postback
    callSendAPI(postbackResponse);
}

async function handlePostback(sender_psid, received_postback) {
    var response;
    // Get the payload for the postback
    let payload = received_postback.payload;
    console.log("Postback payload:", payload);

    if (received_postback.payload === "started") {
        var user = await User.findOne({ sender_psid: sender_psid }).exec();

        if (!user) {
            console.log("Creating new user...");

            const lessonOne = await Lesson.findOne();

            user = new User({
                sender_psid: sender_psid,
                lessons: [
                    {
                        lesson_info: lessonOne,
                        status: "in_progress",
                        progress: 'q000',
                    }
                ]
            });

            await user.save();
        }

        // Sending intro messages
        const question = await Question.findOne({ id: 'q000' });
        response = quickReply(question.title, question.branches);
        let postbackResponse = constructResponseMessage(sender_psid, response)

        let startingMessage = constructTextResponse("Welcome to Code Canary! You've come to the right place to learn code in a very fun way. Let's get Started!");
        callSendAPI(constructResponseMessage(sender_psid, startingMessage))

        setTimeout(function () {
            callSendAPI(postbackResponse);
        }, 2000);

        return;

    } else {
        // Set the response based on the postback payload
        console.log("PAYLOAD:", payload);
        response = await runLesson(sender_psid, payload);
    }

    let postbackResponse = constructResponseMessage(sender_psid, response)

    // Send the message to acknowledge the postback
    callSendAPI(postbackResponse);
}

function callSendAPI(userMessage) {
    // Construct the message body

    // Send the HTTP request to the Messenger Platform
    request({
        "uri": "https://graph.facebook.com/v3.2/me/messages",
        "qs": { "access_token": PAGE_ACCESS_TOKEN },
        "method": "POST",
        "headers": { "Content-Type": "application/json" },
        "json": userMessage,
    }, (err, res, body) => {
        switch (res.statusCode) {
            case 200:
                console.log("Message sent to user successfully!");
                break;
            default:
                console.error("Unable to send message:", userMessage);
                console.error("Received Error:", err);
                console.error("Response was:", body);
                break;
        }
    });
}

function constructResponseMessage(sender_psid, response) {
    return {
        "messaging_type": "RESPONSE",
        "recipient": {
            "id": sender_psid,
        },
        "message": response,
    };
}

function constructTextResponse(message) {
    return {
        "text": message,
    };
}

function constructTemplateResponse(question) {
    return MessageTemplates[question.type]({
        title: question.title,
        subtitle: '',
        buttons: question.branches,
        image_url: question.rendered_image_path,
        url: '',
        media_type: '',
        attachment_id: '',
    })
}

function searchMatchingPicture(tag) {
    Flickr.tokenOnly(flickrOptions, function (error, flickr) {
        flickr.photos.search({
            tags: tag,
            safe_search: 1,
            content_type: 1,
            per_page: 4,
            media: 'photos',
            extras: 'url_o'
        }, function (err, result) {
            if (err) { throw new Error(err); }
            else {
                // returns array, use url_o to get the image link.
                return result.photos.photo
            }
        })
    });
}

module.exports = {
    handleMessage: handleMessage,
    handlePostback: handlePostback,
    searchMatchingPicture: searchMatchingPicture,
    constructTextResponse: constructTextResponse,
    constructTemplateResponse: constructTemplateResponse
}
