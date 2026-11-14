// Review evidence is entered manually from the publisher's dated confirmation in the conversation.
// This legacy command must never infer a review from CLI flags or today's date.
throw Error('Automatic review recording is disabled. Enter reviewedBy and reviewedAt only after Aymane Ouirdani explicitly names the reviewed guides and their review date in the conversation.');
