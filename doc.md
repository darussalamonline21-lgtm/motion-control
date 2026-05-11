Supported Motion Control endpoints in this project:

- Kling 3 Pro: `/v1/ai/video/kling-v3-motion-control-pro`
- Kling 3 Standard: `/v1/ai/video/kling-v3-motion-control-std`
- Kling 2.6 Pro: `/v1/ai/video/kling-v2-6-motion-control-pro`
- Kling 2.6 Standard: `/v1/ai/video/kling-v2-6-motion-control-std`

All use the same request shape: `image_url`, `video_url`, optional `prompt`, `character_orientation`, `cfg_scale`, and optional `webhook_url`.

POST

Kling 3 Motion Control
Kling 3 Pro - Motion control video

Copy page

Transfer motion from a reference video to a character image using Kling 3 Pro. The model preserves the character’s appearance while applying motion patterns from the reference video.

POST
/
v1
/
ai
/
video
/
kling-v3-motion-control-pro

Try it
Documentation Index
Fetch the complete documentation index at: https://docs.magnific.com/llms.txt

Use this file to discover all available pages before exploring further.

Authorizations
​
x-magnific-api-key
stringheaderrequired
Your Magnific API key. Required for authentication. Learn how to obtain an API key

Body
application/json
​
image_url
string<uri>required
URL of the character/reference image. The motion from the reference video will be transferred to this character.

Requirements:

Must be a publicly accessible URL
Minimum resolution: 300x300 pixels
Maximum file size: 10MB
Supported formats: JPG, JPEG, PNG, WEBP
​
video_url
string<uri>required
URL of the reference video containing the motion to transfer.

Requirements:

Must be a publicly accessible URL
Duration: 3-30 seconds
Supported formats: MP4, MOV, WEBM, M4V
​
webhook_url
string<uri>
Webhook URL to notify you when the task completes. When provided, the server will send a POST request to this URL with the task result.

​
prompt
string
Optional text prompt to guide the motion transfer. Cannot exceed 2500 characters.

Maximum string length: 2500
​
character_orientation
enum<string>default:video
How the model interprets spatial information and constrains output duration.

video: Orientation matches reference video. Better for complex motions. Maximum output duration: 30 seconds.
image: Orientation matches reference image. Better for following camera movements. Maximum output duration: 10 seconds.
Available options: video, image 
​
cfg_scale
number<float>default:0.5
The CFG (Classifier Free Guidance) scale controls how closely the model follows the prompt. Higher values mean stronger adherence to the prompt but less flexibility.

Required range: 0 <= x <= 1
Response

200

application/json


GET
Kling 3 Motion Control
Kling 3 Pro Motion Control - List tasks

Copy page

Retrieve the list of all Kling 3 Pro Motion Control video generation tasks for the authenticated user.

GET
/
v1
/
ai
/
video
/
kling-v3-motion-control-pro

Try it
Documentation Index
Fetch the complete documentation index at: https://docs.magnific.com/llms.txt

Use this file to discover all available pages before exploring further.

Authorizations
​
x-magnific-api-key
stringheaderrequired
Your Magnific API key. Required for authentication. Learn how to obtain an API key

Response

200

application/json
OK - The list of Kling 3 Pro Motion Control tasks is returned

​
data
object[]required
