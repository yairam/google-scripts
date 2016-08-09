/*
 * This script goes through your Gmail Inbox and finds recent emails where you
 * were the last respondent. It applies a nice label to them, so you can
 * see them in Priority Inbox or do something else.
 *
 * To remove and ignore an email thread, just remove the unrespondedLabel and
 * apply the ignoreLabel.
 *
 * This is most effective when paired with a time-based script trigger.
 *
 * For installation instructions, read this blog post:
 * http://jonathan-kim.com/2013/Gmail-No-Response/
 */


// Edit these to your liking.
var unrespondedLabel = 'No Response',
    ignoreLabel = 'Ignore No Response',
    minTime = '5d',   // 5 days
    maxTime = '14d';  // 14 days

// Mapping of Gmail search time units to milliseconds.
var UNIT_MAPPING = {
    h: 36e5,    // Hours
    d: 864e5,   // Days
    w: 6048e5,  // Weeks
    m: 263e7,   // Months
    y: 3156e7   // Years
};

var ADD_LABEL_TO_THREAD_LIMIT = 100;
var REMOVE_LABEL_TO_THREAD_LIMIT = 100;

function main() {
  processUnresponded();
  cleanUp();
}

function processUnresponded() {
  var threads = GmailApp.search('is:sent from:me -in:chats  -"Out of office" older_than:' + minTime + ' newer_than:' + maxTime),
      threadMessages = GmailApp.getMessagesForThreads(threads),
      unrespondedThreads = [],
      minTimeAgo = new Date();

  minTimeAgo.setTime(subtract(minTimeAgo, minTime));

  Logger.log('Processing ' + threads.length + ' threads.');

  // Filter threads where I was the last respondent.
  threadMessages.forEach(function(messages, i) {
    var thread = threads[i],
        lastMessage = messages[messages.length - 1],
        lastFrom = lastMessage.getFrom(),
        lastTo = lastMessage.getTo(),  // I don't want to hear about it when I am sender and receiver
        lastMessageIsOld = lastMessage.getDate().getTime() < minTimeAgo.getTime();

    if (isMe(lastFrom) && !isMe(lastTo) && lastMessageIsOld && !threadHasLabel(thread, ignoreLabel)) {
      unrespondedThreads.push(thread);
    }
  })

  // Mark unresponded in bulk.
  markUnresponded(unrespondedThreads);
  Logger.log('Updated ' + unrespondedThreads.length + ' messages.');
}

function subtract(date, timeStr) {
  // Takes a date object and subtracts a Gmail-style time string (e.g. '5d').
  // Returns a new date object.
  var re = /^([0-9]+)([a-zA-Z]+)$/,
      parts = re.exec(timeStr),
      val = parts && parts[1],
      unit = parts && parts[2],
      ms = UNIT_MAPPING[unit];

  return date.getTime() - (val * ms);
}

function isMe(fromAddress) {
  var addresses = getEmailAddresses();
  for (i = 0; i < addresses.length; i++) {
    var address = addresses[i],
        r = RegExp(address, 'i');

    if (r.test(fromAddress)) {
      return true;
    }
  }

  return false;
}

function getEmailAddresses() {
  // Cache email addresses to cut down on API calls.
  if (!this.emails) {
    Logger.log('No cached email addresses. Fetching.');
    var me = Session.getActiveUser().getEmail(),
        emails = GmailApp.getAliases();

    emails.push(me);
    this.emails = emails;
    Logger.log('Found ' + this.emails.length + ' email addresses that belong to you.');
  }
  return this.emails;
}

function threadHasLabel(thread, labelName) {
  var labels = thread.getLabels();

  for (i = 0; i < labels.length; i++) {
    var label = labels[i];

    if (label.getName() == labelName) {
      return true;
    }
  }

  return false;
}

function markUnresponded(threads) {
  var label = getLabel(unrespondedLabel);
  
  // addToThreads has a limit of 100 threads. Use batching.
  if (threads.length > ADD_LABEL_TO_THREAD_LIMIT) {
    for (var i = 0; i < Math.ceil(threads.length / ADD_LABEL_TO_THREAD_LIMIT); i++) {
        label.addToThreads(threads.slice(100 * i, 100 * (i + 1)));
    }
  } else {
      label.addToThreads(threads);
  }
}

function getLabel(labelName) {
  // Cache the labels.
  this.labels = this.labels || {};
  label = this.labels[labelName];

  if (!label) {
    Logger.log('Could not find cached label "' + labelName + '". Fetching.', this.labels);

    var label = GmailApp.getUserLabelByName(labelName);

    if (label) {
      Logger.log('Label exists.');
    } else {
      Logger.log('Label does not exist. Creating it.');
      label = GmailApp.createLabel(labelName);
    }
    this.labels[labelName] = label;
  }
  return label;
}

function cleanUp() {
  var label = getLabel(unrespondedLabel),
      iLabel = getLabel(ignoreLabel),
      threads = label.getThreads(),
      expiredThreads = [],
      expiredDate = new Date();

  expiredDate.setTime(subtract(expiredDate, maxTime));

  if (!threads.length) {
    Logger.log('No threads with that label');
    return;
  } else {
    Logger.log('Processing ' + threads.length + ' threads.');
  }

  threads.forEach(function(thread) {
    var lastMessageDate = thread.getLastMessageDate();

    // Remove all labels from expired threads.
    if (lastMessageDate.getTime() < expiredDate.getTime()) {
      Logger.log('Thread expired');
      expiredThreads.push(thread);
    } else {
      Logger.log('Thread not expired');
    }
  });

    // removeFromThreads has a limit of 100 threads. Use batching.
  if (expiredThreads.length > REMOVE_LABEL_TO_THREAD_LIMIT) {
    for (var i = 0; i < Math.ceil(expiredThreads.length / REMOVE_LABEL_TO_THREAD_LIMIT); i++) {
      label.removeFromThreads(expiredThreads.slice(100 * i, 100 * (i + 1)));
      iLabel.removeFromThreads(expiredThreads.slice(100 * i, 100 * (i + 1)));
    }
  } else {
      label.removeFromThreads(expiredThreads);
      iLabel.removeFromThreads(expiredThreads);
  }
  
  Logger.log(expiredThreads.length + ' unresponded messages expired.');
}
