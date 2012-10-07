// Times in minutes;
var goneTimeout = 10;
var idleTimeout = 5;
var keepaliveTimeout = 9;

var globalFeedTimer;
var keepaliveTimer;
var updateFeedDisplay = true;
var feedBuffer = "";
var feedArray = [];
var userId;
var currentUser;
var accessToken;
var chatRoom;
var rooomName = "Chat Room";
var userPostTimes = {};
var earliestId = 2000000000;
var latestId = 0;
var lastUserList = "";

//-----------------------------------------------------------------------------
// Initialization functions
//-----------------------------------------------------------------------------

function initialize() {
    var hashParams = getHashParams();

    accessToken = hashParams['access_token'];
    chatRoom = hashParams['room'];
    if (chatRoom == null) {
	chatRoom = $.cookie("patterRoom");
    }

    if (accessToken == null) {
        accessToken = $.cookie("patterAccessToken");
	if (accessToken == null && chatRoom != null) {
	    $.cookie("patterRoom", chatRoom, {expires: 30, path: "/"});
	} else {
	    $.cookie("patterRoom", null, {expires: 30, path: "/"});
	}
    } else if (chatRoom != null) {
        $.cookie("patterAccessToken", accessToken, {expires: 30, path: "/"});
	$.cookie("patterRoom", null, {expires: 30, path: "/"});
	refreshPage();
    }

    $("#main").hide();
    $("#main-logged").hide();
    $("#main-join").hide();
    $(".theme").hide();

    if (accessToken != null) {
        // have access - get user info
        getUserInfo('me');
    } else {
	$("#main").show();
    }

    var theme = $.cookie("patterTheme");
    if (theme != null) {
	setTheme(theme);
    }
}

function getUserInfo(uid) {
    endpoint = "https://alpha-api.app.net/stream/0/users/" + uid;
    
    $.ajax({
	url: endpoint,
	type: "GET",
	data: { access_token: accessToken },
	dataType: "json"
    }).done(function(data) {
	if (data.id.length > 0 && data.name.length > 0) {
//	    console.log("Current user:");
//	    console.dir(data);
	    currentUser = data;
	    userId = data.id;
	    $("#user_avatar").attr("src", currentUser.avatar_image.url);
	    $("#user_name").html(currentUser.name);
	    $("#user_username").html("@" + currentUser.username);
	    $("#theme_select").change(function() {
		$("select option:selected").each(function () {
                    setTheme($(this).attr('value'));
		});
	    });
	    $("#form_post").on("submit", function(event) {
		if ($("#main_post").val().length > 0) {
		    postMessage($("#main_post").val());
		}
		return false;
	    });
	    $("#create_button").on("click", function(event) {
		createRoom($("#create_name").val());
	    });
	    if (chatRoom != null) {
		$("#main-logged").show("slow");
		$(".theme").show();
		initName();
		updateGlobalFeed();
		keepalive();
	    } else {
		$("#main-join").show("slow");
	    }
	} else {
	    console.log("Could not get user info.");
	}
    }).fail(function(req, status) {
	$("#main").show();
	console.log("getUserInfo failed: " + status);
	console.dir(req);
	console.dir(req.getAllResponseHeaders());
    });
}

function initName() {
    $(".viewArchive").attr('href', 'http://appnetizens.com/threadchat?chatid=' + chatRoom);
    endpoint = "https://alpha-api.app.net/stream/0/posts/" + chatRoom;
    endpoint += "?include_annotations=1&include_machine=1";
    $.ajax({
	url: endpoint,
	type: "GET",
	dataType: "json",
	beforeSend: setHeader
    }).done(function(data) {
	var annotations = data.annotations;
	if (annotations != null) {
	    var j = 0;
	    for (; j < annotations.length; ++j) {
		if (annotations[j].type == "snark.room") {
		    roomName = annotations[j].value.name;
		    var htmlText = htmlEncode(roomName + ' - (Public Room)')
		    $("#room-name").html(htmlText);
		}
	    }
	}
    });
}

//-----------------------------------------------------------------------------
// Update Functions
//-----------------------------------------------------------------------------

function updateGlobalFeed() {
    var chatArea = $("#global-tab-container")[0];
    clearTimeout(globalFeedTimer);

    // Should the feed load older messages or newer ones.
    var goBack = false;
    if (chatArea.scrollTop <= chatArea.scrollHeight/3
	&& $("#global-tab-container").children().length > 0
	&& earliestId > chatRoom) {
	goBack = true;
    }

    endpoint = "https://alpha-api.app.net/stream/0/posts/" + chatRoom
	+ "/replies";

    var params = new Object;
    params.access_token = accessToken;
    params.include_machine = 1;
    params.include_annotations = 1;
    params.count = 200;

    if ($("#global-tab-container").children().length > 0) {
	if (goBack) {
	    params.before_id = earliestId;
	} else {
	    params.since_id = latestId;
	}
    }

    $.get(endpoint, params, function(data) {
	var allPosts = jQuery('<div/>');
	for (var i = data.length - 1; i > -1; i--) {
	    var newPost = calculatePost(data[i]);
	    if (newPost != null) {
		allPosts.append(newPost);
	    }
	}
	addPostsToFeed(allPosts.contents(), goBack);
    });
    updateUsers();
    globalFeedTimer = setTimeout("updateGlobalFeed()", 2000);
}

function calculatePost(data) {
    var result = null;
    storePostInfo(data);
    var body = calculateBody(data);
    if (body != null) {
	var userMention = new RegExp("'@" + currentUser.username + "'");
	var postClass = 'postRow';
	var timeClass = 'postTimestamp';
	if (data.user.username == currentUser.username) {
	    postClass = 'myPostRow';
	    timeClass = 'myPostTimestamp';
	} else if (userMention.test(body)) {
	    postClass = 'postMentionRow';
	    timeClass = 'postMentionTimestamp';
	}
	var row = jQuery('<div/>');
	row.addClass('postRowWrap');
	row.attr('id', 'post|' + data.id);
	
	var post = jQuery('<div/>');
	post.addClass(postClass);

	var author = jQuery('<a/>');
	author.addClass('author');
	author.attr('href', window.location);
	author.attr('id', '@' + data.user.username);
	author.attr('style', makeUserColor(data.user.username));
//	author.html('<strong id="@' + data.user.username + '">@' + data.user.username + '</strong> ');
	author.text('@' + data.user.username);
	post.append(author);
	post.append(' ');
	post.append(body);
	row.append(post);

	var timestamp = jQuery('<span/>');
	timestamp.addClass(timeClass);
	timestamp.attr('id', 'easydate');
	timestamp.attr('title', data.created_at);
//	timestamp.text("3:34pm");
	row.append(timestamp);
	result = row;
    }
    return result;
}

function storePostInfo(data)
{
    latestId = Math.max(data.id, latestId);
    earliestId = Math.min(data.id, earliestId);
    var created = new Date(data.created_at).getTime();
    if (userPostTimes[data.user.username] == null
	|| userPostTimes[data.user.username] < created) {
	userPostTimes[data.user.username] = created;
    }
}

function calculateBody(data)
{
    var result = null;
    var annotations = data.annotations;
    if (!document.getElementById("post|" + data.id) && annotations != null) {
	var i = 0;
	for (; i < annotations.length; ++i) {
	    if (annotations[i].type == "snark.chat") {
		var text = annotations[i].value.message;
		result = htmlEncode(text);
	    } else if (annotations[i].type == "snark.room") {
		var text = annotations[i].value.name;
		result = "<em>Room <strong>"
		    + htmlEncode(text)
		    + "</strong> created</em>";
	    }
	}
    }
    if (result != null)
    {
	result =
	    result.replace(urlRegex,
			   "<a href='$1' target='_blank'>$1</a>");
	result =
	    result.replace(mentionRegex,
			   "<a href='" + window.location +
			   "' id='$1' class='mention' " +
			   ">$1</a>");
    }
    return result;
}

function updateUsers() {
    var userList = '<h4>User List</h4>' +
	'<ul class="usersList">';
    var goneTime = new Date().getTime() - 1000*60*goneTimeout;
    var idleTime = new Date().getTime() - 1000*60*idleTimeout;
    var keys = Object.keys(userPostTimes);
    keys.sort();
    var i = 0;
    for (; i < keys.length; ++i) {
	var postTime = userPostTimes[keys[i]]
	if ((postTime != null && postTime >= goneTime)
	    || keys[i] == currentUser.username)
	{
	    var user = htmlEncode(keys[i]);
	    var userClass = "idleUser";
	    if (keys[i] == currentUser.username) {
		userClass = "myAccount";
	    } else if (postTime != null && postTime >= idleTime) {
		userClass = "activeUser";
	    }
	    userList += "<li><a href='" + window.location + "' class='"
		+ userClass + "' style='"
		+ makeUserColor(user) + "'><strong id='@" + user + "'>@"
		+ user + "</strong></a></li>";
	}
    }
    userList += "</ul>";
    if (userList != lastUserList) {
	$("#user-list").html(userList);
	$(".activeUser").on("click", insertUserIntoText);
	$(".idleUser").on("click", insertUserIntoText);
	lastUserList = userList;
    }
}

//-----------------------------------------------------------------------------
// Post Functions
//-----------------------------------------------------------------------------

function createRoom(name) {
    var post = {
	machine_only: true,
	annotations: [{type: "snark.room", value: {name: name}}]
    };
    var endpoint = "https://alpha-api.app.net/stream/0/posts";
    jsonPost(endpoint, post, function(data) {
	chatRoom = data.thread_id;
	refreshPage();
    });
}

function postMessage(messageString) {
    var post = {
	machine_only: true,
	reply_to: chatRoom,
	annotations: [{type: "snark.chat", value: {message: messageString}}]
    };
    var endpoint = "https://alpha-api.app.net/stream/0/posts";
    endpoint += "?include_annotations=1";
    jsonPost(endpoint, post, function(data) {
	addPostsToFeed(calculatePost(data), false);
    });

    $("#main_post").val("");
}

function keepalive() {
//    clearTimeout(keepaliveTimer);
    var post = {
	machine_only: true,
	reply_to: chatRoom,
	annotations: [{type: "snark.keepalive", value: {ping: 1}}]
    };
    var endpoint = "https://alpha-api.app.net/stream/0/posts";
    jsonPost(endpoint, post, function(data) {});
//    keepaliveTimer = setTimeout("keepalive()", 1000 * 60 * keepaliveTimeout);
}

function jsonPost(endpoint, data, success) {
    $.ajax({
	url: endpoint,
	type: "POST",
	contentType: "application/json",
	data: JSON.stringify(data),
	dataType: "json",
	beforeSend: setHeader
    }).done(function(data) {
	success(data);
    }).fail(function(req, status) {
	console.log("jsonPost failed: " + status);
	console.dir(req);
	console.dir(req.getAllResponseHeaders());
    });
}

//-----------------------------------------------------------------------------
// Utility functions
//-----------------------------------------------------------------------------

function addPostsToFeed(posts, addBefore)
{
    if (posts != null) {
	var chatArea = document.getElementById("global-tab-container");
	var oldHeight = chatArea.scrollHeight;
	var oldClient = chatArea.clientHeight;
	var oldTop = chatArea.scrollTop;
	$("#easydate", posts).easydate({
	locale: { 
	    "future_format": "%s %t", 
	    "past_format": "%t %s", 
	    "second": "s", 
	    "seconds": "s", 
	    "minute": "m", 
	    "minutes": "m", 
	    "hour": "h", 
	    "hours": "h", 
	    "day": "day", 
	    "days": "days", 
	    "week": "week", 
	    "weeks": "weeks", 
	    "month": "month", 
	    "months": "months", 
	    "year": "year", 
	    "years": "years", 
	    "yesterday": "yesterday", 
	    "tomorrow": "tomorrow", 
	    "now": "now", 
	    "ago": " ", 
	    "in": "in" }});
	if (addBefore) {
	    $("#global-tab-container").prepend(posts);
//	    formatTimestamps();
	    chatArea.scrollTop = oldTop + chatArea.scrollHeight - oldHeight;
	} else {
	    $(".mention", posts).on("click", insertUserIntoText);
	    $(".author", posts).on("click", insertUserIntoText);
	    $("#global-tab-container").append(posts);
//	    formatTimestamps();
	    var oldBottom = Math.max(oldHeight, oldClient) - oldClient;
	    if (oldTop == oldBottom) {
		chatArea.scrollTop = Math.max(chatArea.scrollHeight,
					      chatArea.clientHeight)
		    - chatArea.clientHeight;
	    }
	    if (oldHeight != chatArea.scrollHeight) {
		$.titleAlert("New Message", { duration: 10000,
					      interval: 1000,
					      requireBlur: true});
	    }
	}
    }
}

function htmlEncode(value){
    if (value) {
        return jQuery('<div />').text(value).html();
    } else {
        return '';
    }
}
 
function htmlDecode(value) {
    if (value) {
        return $('<div />').html(value).text();
    } else {
        return '';
    }
}

function getHashParams() {

    var hashParams = {};
    var e,
        a = /\+/g,  // Regex for replacing addition symbol with a space
        r = /([^&;=]+)=?([^&;]*)/g,
        d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
        q = window.location.hash.substring(1);

    while (e = r.exec(q))
       hashParams[d(e[1])] = d(e[2]);

    return hashParams;
}

function setHeader(xhr) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
}

function insertUserIntoText(event) {
    var user = event.target.id;
    var textBox = $("#main_post");
    var cursor = textBox.caret().start;
    var text = textBox.val();
    var before = text.substring(0, cursor);
    var after = text.substring(cursor);
    textBox.focus();
    textBox.val(before + user + after);
    textBox.caret(cursor + user.length, cursor + user.length);
}

function refreshPage() {
    var redirect = "http://patter-app.net/chat";
    if (chatRoom != null) {
	redirect += "#room=" + chatRoom;
    }
    window.location = redirect;
    window.location.reload(true);
}

function formatTimestamps() {
/*
    $(".easydate").easydate({
	locale: { 
	    "future_format": "%s %t", 
	    "past_format": "%t %s", 
	    "second": "s", 
	    "seconds": "s", 
	    "minute": "m", 
	    "minutes": "m", 
	    "hour": "h", 
	    "hours": "h", 
	    "day": "day", 
	    "days": "days", 
	    "week": "week", 
	    "weeks": "weeks", 
	    "month": "month", 
	    "months": "months", 
	    "year": "year", 
	    "years": "years", 
	    "yesterday": "yesterday", 
	    "tomorrow": "tomorrow", 
	    "now": "now", 
	    "ago": " ", 
	    "in": "in" 
	}});
*/
/*
	units: [ 
	    { name: "now", limit: 5 }, 
	    { name: "s", limit: 60, in_seconds: 1 }, 
	    { name: "m", limit: 3600, in_seconds: 60 }, 
	    { name: "h", limit: 86400, in_seconds: 3600  }, 
	    { name: "day", limit: 172800, in_seconds: 86400 }, 
	    { name: "week", limit: 2629743, in_seconds: 604800  }, 
	    { name: "month", limit: 31556926, in_seconds: 2629743 }, 
	    { name: "year", limit: Infinity, in_seconds: 31556926 } 
	]});
*/
}

function makeUserColor(user) {
    var hash = getHash(user);
    var color = (hash & 0x007f7f7f).toString(16);
    return "color: #" + color + ";";
}

function getHash(str) {
    var hash = 0;
    if (str.length == 0) return hash;
    var i = 0;
    for (; i < str.length; i++) {
        var char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
};

function setTheme(theme) {
    $("link").each(function(index, element) {
	if (element.getAttribute("rel").indexOf("style") != -1
	    && element.getAttribute("title")) {
	    element.disabled = true;
	    if (element.title == theme) {
		element.disabled = false;
	    }
	}
    });
    $.cookie("patterTheme", theme, {expires: 30, path: "/"});
    $("#theme_select").val(theme);
}

var mentionRegex = /(@[a-zA-Z0-9\-_]+)\b/g;

var urlRegex = /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/g;
