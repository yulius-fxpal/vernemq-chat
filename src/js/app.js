'use strict';

const USERS_LIST_TOPIC_PREFIX = 'users';
const USERS_LIST_TOPIC = USERS_LIST_TOPIC_PREFIX + '/#';
const CHAT_ROOM_TOPIC = 'chat';

// Default MQTT broker to connect to.
const DEFAULT_BROKER_HOST = window.location.hostname;
const DEFAULT_BROKER_PORT = '8080';

const USER_STYLE = {
  MY_USER_COLOR: 'loggedUser',
  MY_USER_ICON: 'fas fa-user',
  OTHER_USER_COLOR: 'text-primary',
  OTHER_USER_ICON: 'far fa-user'
};

const MSG_LEVEL_STYLE = {
  INFO: 'text-info',
  WARN: 'text-warning',
  ERROR: 'text-danger',
  SUCCESS: 'text-success'
};

const CONNECTION_ERROR_MESSAGE = {
  0: 'Connection accepted',
  1: 'The Server does not support the level of the MQTT protocol requested by the Client',
  2: 'The Client identifier is correct UTF-8 but not allowed by the Server',
  3: 'The Network Connection has been made but the MQTT service is unavailable',
  4: 'The data in the user name or password is malformed',
  5: 'The Client is not authorized to connect',
}

var client;
var clientId;

$(function() {
  $('#brokerHost').val(DEFAULT_BROKER_HOST);
  $('#brokerPort').val(DEFAULT_BROKER_PORT);

  $('#sendMessage').on('keypress', function(e) {
    if (e && e.keyCode === 13) {
      $('#replyBtn').click();
    }
  });

  $('#password').on('keypress', function(e) {
    if (e && e.keyCode === 13) {
      onConnectBtn();
    }
  });

  $('#clearMessages').click(function() {
    $('#messages').empty();
  });

  $('#connectBtn').click(onConnectBtn);
  $('#disconnectBtn').click(onDisconnectBtn);

});

function onConnectBtn() {
  showMessage(MSG_LEVEL_STYLE.INFO, 'Connecting to the MQTT server...');

  disableLogin();

  var host = $('#brokerHost').val();
  var port = $('#brokerPort').val();
  var username = $('#username').val();
  var password = $('#password').val();
  $('#password').val('');
  clientId = username + '_' + new Date().getTime().toString(36);
  client = new Paho.MQTT.Client(host, Number(port), clientId);

  // set callback handlers
  client.onConnectionLost = onConnectionLost;
  client.onMessageArrived = onMessageArrived;

  // connect the client
  client.connect({
    userName: username,
    password: password,
    onSuccess: onConnectionSuccess,
    onFailure: onConnectionFailure,
  });
}

function onDisconnectBtn() {
  showMessage(MSG_LEVEL_STYLE.INFO, 'Exited');
  client.send(makeDisconnectMessage(clientId));
  client.disconnect();
  close();
}


function onConnectionLost(responseObject) {
  var message = CONNECTION_ERROR_MESSAGE[responseObject.errorCode] || 'Unknown error: ' + String(responseObject.errorCode);
  showMessage(MSG_LEVEL_STYLE.ERROR, responseObject.errorMessage);
  close();
}

function close() {
  disableDisconnection();
  disableUserMessage();
  enableLogin();
}

function onConnectionSuccess() {
  showMessage(MSG_LEVEL_STYLE.SUCCESS, 'Connected to the MQTT server');
  connected(client, clientId);
}

function onConnectionFailure(context) {
  console.log(context);
  showMessage(MSG_LEVEL_STYLE.ERROR, 'Connection failure: ' + context.errorMessage);
  close()
}


function onMessageArrived(message) {
  // Upon receiving a "presence" message.
  if (message.destinationName.startsWith(USERS_LIST_TOPIC_PREFIX)) {
    handlePresence(message, clientId);
  } else if (message.destinationName === CHAT_ROOM_TOPIC) {
    // Upon receiving a "chat" message.
    handleChatMessage(message, clientId);
  }
}

function handlePresence(message, myClientId) {
  const encodedUser = message.destinationName.split('/')[1];
  const user = decodeUser(encodedUser);
  if (!message.payloadString) {
    $('#' + user.clientId).remove();
    showMessage(MSG_LEVEL_STYLE.INFO, user.username + ' has left the chat');
  } else {
    console.log('handlePresence', message, myClientId);
    const isMe = user.clientId === myClientId;
    showNewLoggedUser(user, isMe, message.payloadString);
  }
}

function handleChatMessage(message, myClientId) {
  const parsedPayload = JSON.parse(message.payloadString);
  const messageAuthor = decodeUser(parsedPayload.clientId);
  showUserMessage(messageAuthor, messageAuthor.clientId === myClientId,
    parsedPayload.textReply);
}

function connected(mqttClient, myClientId) {
  mqttClient.subscribe(CHAT_ROOM_TOPIC);
  mqttClient.subscribe(USERS_LIST_TOPIC);

  sendPresence(mqttClient, myClientId);
  enableDisconnection(mqttClient, myClientId);
  enableUserMessage(mqttClient, myClientId);
  disableLogin();
}

function sendPresence(mqttClient, myClientId) {
  const structuredPayload = { timestamp: new Date().getTime() };
  const plainPayload = JSON.stringify(structuredPayload);
  const presenceMessage = new Paho.MQTT.Message(plainPayload);
  presenceMessage.destinationName = makeUserTopic(myClientId);
  presenceMessage.retained = true;
  mqttClient.send(presenceMessage);
}

function makeUserTopic(clientId) {
  return USERS_LIST_TOPIC_PREFIX + '/' + clientId;
}

function enableDisconnection(mqttClient, myClientId) {
  setDisconnectBtnDisabled(false);
}

function disableDisconnection() {
  if (!isDisabled('#disconnectBtn')) {
    setDisconnectBtnDisabled(true);
  }
}

window.onbeforeunload = function() {
  onDisconnectBtn();
}

function makeDisconnectMessage(myClientId) {
  const userTopic = makeUserTopic(myClientId);
  const disconnectMessage = new Paho.MQTT.Message(new Int8Array());
  disconnectMessage.retained = true;
  disconnectMessage.destinationName = userTopic;
  return disconnectMessage;
}

function enableUserMessage(mqttClient, myClientID) {
  $('#replyBtn').click(function() {
    sendNewChatMessage(mqttClient, myClientID);
  });

  setUserMessageDisabled(false);
}

function disableUserMessage() {
  if (!isDisabled('#sendMessage')) {
    setUserMessageDisabled(true);
    $('#replyBtn').unbind('click');
  }
}

function setUserMessageDisabled(disabled) {
  $('#sendMessage').prop('disabled', disabled);
  $('#replyBtn').prop('disabled', disabled);
}

function sendNewChatMessage(mqttClient, myClientId) {
  const structuredPayload = {
    clientId: myClientId,
    textReply: $('#sendMessage').val()
  };

  const plainPayload = JSON.stringify(structuredPayload);
  const message = new Paho.MQTT.Message(plainPayload);
  message.destinationName = CHAT_ROOM_TOPIC;
  mqttClient.send(message);

  $('#sendMessage').val('');
  $('#sendMessage').focus();
}

function connectionFailed(response) {
  showMessage(MSG_LEVEL_STYLE.ERROR, response.errorMessage);
  close();
}

function showNewLoggedUser(decodedUser, isMe, presenceMessagePayload) {
  updateUsersList(decodedUser, isMe);

  const parsedPayload = JSON.parse(presenceMessagePayload);
  const connectTimestamp = parsedPayload.timestamp;
  const now = new Date().getTime();
  if ((now - connectTimestamp) <= 10 * 1000) {
    showMessage(MSG_LEVEL_STYLE.INFO, decodedUser.username
      + ' has joined the chat');
  }
}

function decodeUser(encodedUser) {
  const lastUsernameIndex = encodedUser.lastIndexOf('_');
  const username = encodedUser.substring(0, lastUsernameIndex);
  return { clientId: encodedUser, username: username };
}

function updateUsersList(decodedUser, isMe) {
  const userColorClass = decodeUserColor(isMe);
  const userIconClass = decoderUserIcon(isMe);
  const userTextSuffix = isMe ? ' (you) ' : '';

  const newUser = $('<li>')
    .prop('id', decodedUser.clientId)
    .addClass('list-group-item')
    .addClass('p-1 border-0')
    .addClass(userColorClass)
    .append($('<i>').addClass(userIconClass).addClass('mr-1'))
    .append(decodedUser.username + userTextSuffix);

  // Insert the icon relative to this user at the beginning.
  if (isMe) {
    $('#usersList').prepend(newUser);
  } else {
    $('#usersList').append(newUser);
  }
}

function decodeUserColor(isMe) {
  return isMe ? USER_STYLE.MY_USER_COLOR : USER_STYLE.OTHER_USER_COLOR;
}

function decoderUserIcon(isMe) {
  return isMe ? USER_STYLE.MY_USER_ICON : USER_STYLE.OTHER_USER_ICON;
}

function showUserMessage(decodedUser, isMe, message) {
  const messageStyle = decodeUserColor(isMe);
  showMessage(messageStyle, decodedUser.username + ': ' + message);
}

function showMessage(messageStyle, message) {
  $('#messages')
    .append($('<div>').addClass(messageStyle).text(message)
    );

  const scrollHeight = $('#messages').prop('scrollHeight');
  if (scrollHeight > 0) {
    $('#messages').animate({ scrollTop: scrollHeight }, 1500);
  }
}

function enableLogin() {
  changeLoginFormStatusTo(true);
  $('#user').val('');
  $('#usersList li').fadeTo(500, 0.01, function() {
    $(this).slideUp(150, function() {
      $(this).remove();
    });
  });
}

function disableLogin() {
  changeLoginFormStatusTo(false);
}

function changeLoginFormStatusTo(enable) {
  $('#brokerHost').prop('disabled', !enable);
  $('#brokerPort').prop('disabled', !enable);
  $('#connectBtn').prop('disabled', !enable);
  $('#username').prop('disabled', !enable);
  $('#password').prop('disabled', !enable);
}

function setDisconnectBtnDisabled(disabled) {
  $('#disconnectBtn').prop('disabled', disabled);
}

function isDisabled(element) {
  return $(element).prop('disabled');
}
