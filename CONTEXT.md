# Xiaolu Vision Assistant

Xiaolu Vision Assistant is a multi-person, vision-aware voice assistant that listens for a user addressing the assistant, captures the relevant visual context, and answers by text and speech.

## Language

**Xiaolu**:
The assistant persona addressed by users in conversation. The spoken forms "小噜" and "小鹿" both refer to Xiaolu.
_Avoid_: Bot, agent, keyword

**Wake Word**:
A spoken assistant name that marks the following speech as intended for Xiaolu. For this product, "小噜" and "小鹿" are wake words.
_Avoid_: Keyword, feature word, trigger word

**Visual Voice Question**:
A user request that combines spoken text with a camera frame or shared visual context so Xiaolu can answer about what the user is seeing.
_Avoid_: Voice command, image query

**Camera Keyframe**:
A single representative image captured from the live camera after the user has finished speaking.
_Avoid_: Screenshot, frame grab

**Quiet Window**:
The period with no new recognized speech that marks the end of one visual voice question.
_Avoid_: Timeout, delay
