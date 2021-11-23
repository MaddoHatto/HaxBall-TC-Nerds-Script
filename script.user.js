// ==UserScript==
// @name         HaxBall TC Nerds script
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  try to take over the world!
// @author       MaddoHatto
// @source       https://github.com/MaddoHatto/HaxBall-TC-Nerds-Script
// @match        https://www.haxball.com/headless
// @require      https://code.jquery.com/jquery-1.12.4.min.js
// @grant        none
// @license       GPL-3.0-or-later; https://www.gnu.org/licenses/gpl-3.0.txt
// ==/UserScript==

const RED_TEAM_ID = 1;
const BLUE_TEAM_ID = 2;
const BACKEND_BASE_URL = 'https://hax.opac.pl/';

const BALL_RADIUS = 10;
const PLAYER_RADIUS = 15;

const DISC_BALL_ID = 0;
const OFFSIDE_AVATAR = '🔥';

const SAVE_REPLAY_BUTTON_ID = 'SAVE_REPLAY_BUTTON_ID';
const HOST_HANDICAP = '40';

const playersAvatars = {
    MaddoHatto: '🐻',
    "Nelson Mandela": 'xD',
    Amman: '🐺',
    ToPP: '🤡',
    hubigz: 'H',
    adamaru: '😈',
    rybak: '🧟‍♂️',
    panda: '🐼'
}

class HaxBallController {

    constructor() {
        this.touchingTheBallTimestamps = {};
        this.ballSpeed = 0;
        this.prevBallPosition = null;
        this.goals = [];
        this.gameStartTimestamp = null;
        this.gameEndTimestamp = null;
        this.isPaused = false;
        this.isOffsideActive = false;
        this.votesForUnpause = {};
        this.tick = 0;
        this.logBallSpeed = false;
        this.logPlayerPosition = false;
        this.playersOffsidePosition = {
            [RED_TEAM_ID]: {},
            [BLUE_TEAM_ID]: {},
        };
        this.playersInitPosition = {
            [RED_TEAM_ID]: {},
            [BLUE_TEAM_ID]: {},
        };
        this.initXLine = {
            [RED_TEAM_ID]: 0,
            [BLUE_TEAM_ID]: 0,
        }
        this.client = new Client();
        this.gamePageController = null;
        this.matchResult = null;
    }

    initRoom() {
        this.room = window.HBInit({
            roomName: "TC_NERDS_ROOM",
            password: '1',
            maxPlayers: 16,
            noPlayer: true // Remove host player (recommended!)
        });

        this.room.setDefaultStadium("Rounded");
        this.room.setScoreLimit(10);
        this.room.setTimeLimit(10);

        window.hbRoom = this.room;
        window.hbController = this;

        return this;
    }

    initListeners() {
        this.room.onPlayerChat = this.onPlayerChat.bind(this);
        this.room.onGameTick = this.onGameTick.bind(this);
        this.room.onGameStart = this.onGameStart.bind(this);
        this.room.onPlayerJoin = this.onPlayerJoin.bind(this);
        this.room.onPlayerLeave = this.onPlayerLeave.bind(this);
        this.room.onTeamGoal = this.onTeamGoal.bind(this);
        this.room.onTeamVictory = this.onTeamVictory.bind(this);
        this.room.onPlayerBallKick = this.onPlayerBallKick.bind(this);
        this.room.onGamePause = this.onGamePause.bind(this);
        this.room.onGameUnpause = this.onGameUnpause.bind(this);
        this.room.onPositionsReset = this.onPositionsReset.bind(this);

        return this;
    }

    initUserInterface() {
        try {
            document.body.style.background = '#939e7f url("https://www.haxball.com/hiF05fAx/__cache_static__/g/images/bg.png") fixed';
            this.waitForRoomLinkElement(() => {
                let button = document.createElement("button");
                button.innerHTML = "PLAY";
                button.onclick = this.goToGameTab.bind(this);
                button.style.color = '#fff';
                button.style.height = '100px';
                button.style.width = '450px';
                button.style.position = 'fixed';
                button.style.top = '150px';
                button.style.left = '10px';
                button.style.fontSize = '36px';
                button.style.background = 'linear-gradient(#8da86b, #658d59)';
                button.style.border = '4px solid white';
                button.style.borderRadius = '50px';
                button.style.cursor = 'pointer';

                button = document.body.appendChild(button);
            });
        } catch (error) {
            console.log(error);
        }

        return this;
    }

    onPositionsReset() {
        this.clearPlayersOffsidePosition();
        this.updateIsOffsideActive(false);
    }

    onPlayerChat(player, message) {

        if (this.isPauseCommand(message)) {
            return this.handlePauseCommand(player, message);
        }

        if (this.isFindTeamsCommand(message)) {
            return this.handleFindTeamsCommand();
        }

        if (this.isVoteForUnpauseCommand(message)) {
            return this.handleVoteForUnpauseCommand(player);
        }

        return true;
    }

    onGameTick() {
        this.updateTouchingTheBall();
        this.updateBallSpeed();

        this.updateBallPosition();
        this.tick++;
    }

    onGameStart() {
        this.updateGameStartTimestamp();
        this.updateInitPlayerPositions();
    }

    onPlayerJoin(player) {
        this.updateAdmins();
        this.resetPlayerAvatar(player);
    }

    onPlayerLeave() {
        this.updateAdmins();
    }

    onTeamGoal(teamId) {
        this.updateScorers(teamId);
        this.clearPlayersOffsidePosition();
    }

    onTeamVictory(scores) {
        this.updateGameEndTimestamp();

        this.matchResult = this.getMatchResult(scores);
        console.log('MATCH RESULT = ', this.matchResult);

        try {
            if (this.gamePageController) {
                setTimeout(() => {
                    //const shouldSave = this.gamePageController.showConfirmModal('Save replay?');

                    //if (shouldSave) {
                    //    this.saveMatchResult();
                    //}
                }, 5000);
            }

            this.addSaveReplayButton();

        } catch(error) {
            console.log(error);
        }
        this.clear();
    }

    onPlayerBallKick(player) {
        this.updatePlayerTochedTheBall(player);
        this.updatePlayersOffsidePosition(player);
        this.updateIsOffsideActive(true);
    }

    onGamePause() {
        this.isPaused = true;
    }

    onGameUnpause() {
        this.isPaused = false;
    }

    getRoom() {
        return this.room;
    }

    getMatchResult(scores) {
        return {
            score: {
                Blue: scores.blue,
                Red: scores.red
            },
            teams: this.getTeams(),
            goals: this.goals,
            startTimestamp: this.gameStartTimestamp,
            endTimestamp: this.gameEndTimestamp,
            duration: scores.time,
            rawPositionsAtEnd: this.getRawPositionsAtEnd()
        };
    }

    getTeams() {
        const players = this.room.getPlayerList();
        const result = {
            Red: [],
            Blue: [],
            Spectators: []
        };

        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            const teamName = this.getTeamName(player.team);

            if (result[teamName]) {
                result[teamName].push(player.name);
            }
        }

        return result;
    }

    getPlayers() {
        const players = this.room.getPlayerList();
        const result = [];

        for (let i = 0; i < players.length; i++) {
            const player = players[i];

            if (player.team === RED_TEAM_ID || player.team === BLUE_TEAM_ID) {
                result.push(player);
            }
        }

        return result;
    }

    getTeamName(teamId) {
        if (teamId === RED_TEAM_ID) {
            return 'Red';
        }

        if (teamId === BLUE_TEAM_ID) {
            return 'Blue';
        }

        return 'Spectators';
    }

    getEnemyTeamId(teamId) {
        return teamId === RED_TEAM_ID ? BLUE_TEAM_ID : RED_TEAM_ID;
    }

    getRawPositionsAtEnd() {
        let result = '';
        const players = this.getPlayers();

        for (let i = 0; i < players.length; i++) {
            const player = players[i];

            if (player) {
                const { x, y } = player.position;
                result = `${result}${x}--${y}|`;
            }
        }

        return result;
    }

    updateAdmins() {
        const players = this.room.getPlayerList();
        if ( players.length == 0 ) return; // No players left, do nothing.
        if ( players.find((player) => player.admin) != null ) return; // There's an admin left so do nothing.
        this.room.setPlayerAdmin(players[0].id, true); // Give admin to the first non admin player in the list

        setTimeout(() => {
            this.setHostHandicap();
        }, 3000);
    }

    updateGameStartTimestamp() {
        this.gameStartTimestamp = new Date().valueOf();
    }

    updateGameEndTimestamp() {
        this.gameEndTimestamp = new Date().valueOf();
    }

    updateBallSpeed() {
        if (this.prevBallPosition) {
            const currentBallPosition = this.room.getBallPosition();
            if (currentBallPosition) {
                const vector = Math.sqrt(Math.pow(this.prevBallPosition.x - currentBallPosition.x, 2) + Math.pow(this.prevBallPosition.y - currentBallPosition.y, 2));
                const speed = vector * 60; // game tick is 1/60 of second

                this.ballSpeed = (parseFloat((speed / 100).toFixed(2)) * 3600) / 1000; // km/h
            }
        }

        if (this.logBallSpeed && this.tick % 10 === 0) {
            console.log('Ball speed: ' + this.ballSpeed + 'km/h');
        }
    }

    updateBallPosition() {
        this.prevBallPosition = this.room.getBallPosition();
    }

    updateInitPlayerPositions() {
        const players = this.getPlayers();

        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            this.playersInitPosition[player.team][player.id] = player.position;
            this.initXLine[player.team] = player.position.x;
        }
    }

    updateTouchingTheBall() {
        const players = this.getPlayers();
        const ballPosition = this.room.getBallPosition();
        const ballRadius = 10;
        const playerRadius = 15;
        const triggerDistance = ballRadius + playerRadius + 0.01;
        const timestamp = new Date().valueOf();

        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            if ( player.position == null ) continue; // Skip players that don't have a position

            const distanceToBall = this.pointDistance(player.position, ballPosition);

            if ( distanceToBall < triggerDistance ) {
                this.touchingTheBallTimestamps[player.id] = timestamp;

                if (this.playersOffsidePosition[player.team][player.id]) {
                    this.handleOffside(player);
                } else {
                    this.clearPlayersOffsidePosition(player.team === RED_TEAM_ID ? BLUE_TEAM_ID : RED_TEAM_ID);
                }
            }

            if (this.logPlayerPosition && this.tick % 10 === 0) {
                console.log('Player ' + player.name + ' position: x = ' + player.position.x + ', y =' + player.position.y);
            }
        }
    }

    updatePlayersOffsidePosition(kicker) {
        const kickerTeamId = kicker.team;

        if (!this.isOffsideActive) {
            return;
        }

        if (this.playersOffsidePosition[kickerTeamId][kicker.id]) {
            this.handleOffside(kicker);
            return;
        }

        const playerList = this.getPlayers();
        const ballPosition = this.room.getBallPosition();
        const ballOffset = kickerTeamId === RED_TEAM_ID ? BALL_RADIUS : -BALL_RADIUS;
        const playerOffset = kickerTeamId === RED_TEAM_ID ? PLAYER_RADIUS : -PLAYER_RADIUS;

        let offsideLine = ballPosition.x + ballOffset;

        this.clearPlayersOffsidePosition();
        const kickerTeam = [];

        for (let i = 0; i < playerList.length; i++) {
            const player = playerList[i];

            if (player.id === kicker.id) {
                continue;
            }

            if (player.team === kickerTeamId) {
                kickerTeam.push(player);
            } else if (player.position !== null) {
                const position = player.position.x + playerOffset;

                if (
                    (kickerTeamId === RED_TEAM_ID && offsideLine < position)
                    || (kickerTeamId === BLUE_TEAM_ID && offsideLine > position)
                ) {
                    offsideLine = position
                }
            }
        }

        for(let i = 0; i < kickerTeam.length; i++) {
            const player = kickerTeam[i];

            if (player.position !== null) {
                const position = player.position.x + playerOffset;

                if (
                    (kickerTeamId === RED_TEAM_ID && offsideLine < position && this.initXLine[RED_TEAM_ID] < position)
                    || (kickerTeamId === BLUE_TEAM_ID && offsideLine > position && this.initXLine[BLUE_TEAM_ID] > position)
                ) {
                    this.playersOffsidePosition[kickerTeamId][player.id] = player.name;
                }
            }
        }

        const offsidePlayerIds = Object.keys(this.playersOffsidePosition[kickerTeamId]);
        for(let i = 0; i < offsidePlayerIds.length; i++) {
            const playerId = offsidePlayerIds[i];
            this.room.sendAnnouncement('Player ' + this.playersOffsidePosition[kickerTeamId][playerId] + ' is offside', null, 0xFFFFFF, null, 0);
            console.log(`PLAYER ${playerId} AVATAR ${OFFSIDE_AVATAR}`);
            this.room.setPlayerAvatar(playerId, OFFSIDE_AVATAR);
        }
    }

    updatePlayerTochedTheBall(player) {
        this.touchingTheBallTimestamps[player.id] = new Date().valueOf();
    }

    updateScorers(teamId) {
        const players = this.getPlayers();
        let scorerId = null;
        let scorerName = 'Unknown';
        let closestTimestamp = null;

        for (let i = 0; i < players.length; i++) {
            const player = players[i];

            if (player.team === teamId) {
                const playerTimestamp = this.touchingTheBallTimestamps[player.id];

                if (playerTimestamp && (closestTimestamp === null || closestTimestamp < playerTimestamp)) {
                    closestTimestamp = playerTimestamp;
                    scorerId = player.id;
                    scorerName = player.name;
                }
            }
        }

        this.room.sendAnnouncement('Goal scored by ' + scorerName, null, 0x00FF00, "bold", 2);
        this.addGoal(scorerName, teamId);
        this.clearTouchingTheBallTimestamp();
    }

    updateIsOffsideActive(value) {
        this.isOffsideActive = value;
    }

    handleOffside(player) {
        this.room.pauseGame(true);
        this.room.sendAnnouncement(this.getTeamName(player.team) + ' team offside', null, 0xFFFFFF, "bold", 2);

        const players = this.getPlayers();
        const offsideTeamId = player.team;
        const enemyTeamId = this.getEnemyTeamId(offsideTeamId);

        const playerDiscProperties = this.room.getPlayerDiscProperties(player.id);

        this.resetTeamToInitPosition();

        const initXLine = this.initXLine[enemyTeamId];
        const offset = enemyTeamId === RED_TEAM_ID ? 100 : -100;

        this.room.setDiscProperties(DISC_BALL_ID, {
            x: initXLine + offset,
            y: 0,
            xspeed: 0,
            yspeed: 0,
        });

        this.clearPlayersOffsidePosition();
        this.room.pauseGame(false);
        this.updateIsOffsideActive(false);
    }

    handlePauseCommand(player, message) {
        this.room.pauseGame(true);
        this.room.sendAnnouncement('Game paused by ' + player.name, null, 0x00FF00, "bold", 2);
        this.votesForUnpause = {};
        return false;
    }

    handleFindTeamsCommand() {
        const playerList = this.room.getPlayerList();

        if (playerList.length % 2 != 0) {
            this.room.sendAnnouncement('You have to have even amount of players!', null, 0xFF0000 , "bold", 2);
            return;
        }

        this.client.getCalculatedTeams(playerList, this.handleCalculatedTeams.bind(this));
        return false;
    }

    handleCalculatedTeams(red, blue) {
        let firstRow = "Hi there! As Official Haxball's Scripted Referee I suggest these teams for tonight's skirmish:";
        let secondRow = "On left side, in red uniforms:";
        let thirdRow = "On right side, wearing blue: "

        for (let i = 0; i < red.length; i++) {
            secondRow += " @" + red[i];
            thirdRow += " @" + blue[i];
        }

        this.room.sendAnnouncement(firstRow);
        this.room.sendAnnouncement(secondRow, null, 0xE54141);
        this.room.sendAnnouncement(thirdRow, null, 0x5DADE2);
    }

    handleVoteForUnpauseCommand(player) {
        // check if already voted
        if (this.votesForUnpause[player.id]) {
            return;
        }

        this.votesForUnpause[player.id] = true;
        const playerList = this.getPlayers();
        const playersCount = playerList.length;
        let votesCount = 0;

        for (let i = 0; i < playerList.length; i++) {
            const player = playerList[i];

            if (this.votesForUnpause[player.id]) {
                votesCount++;
            }
        }

        if (votesCount === playersCount) {
            this.room.sendAnnouncement('All players voted to unpause!', null, 0x00FF00, "bold", 2);
            this.room.pauseGame(false);
        } else {
            this.room.sendAnnouncement('Player ' + player.name + ' voted to unpause (' + votesCount + '/' + playersCount + ')', null, 0x0FFC107, "bold", 2);
        }
    }

    handlePostMatchResult(data) {
        console.log(data);
    }

    isPauseCommand(message) {
        const commands = ['p', 'pp', 'ppp', 'pauza'];
        const trimmedMessage = message.trim();

        return commands.indexOf(trimmedMessage) !== -1 && !this.isPaused;
    }

    isFindTeamsCommand(message) {
        const commands = ['find-teams'];
        const trimmedMessage = message.trim();

        return commands.indexOf(trimmedMessage) !== -1;
    }

    isVoteForUnpauseCommand(message) {
        const commands = ['go', 'rdy'];
        const trimmedMessage = message.trim();

        return this.isPaused && commands.indexOf(trimmedMessage) !== -1;
    }

    changePlayerColor(playerId, color) {
        this.room.setPlayerDiscProperties(playerId, {
            color,
        });
    }

    addGoal(scorerName, teamId) {
        const scores = this.room.getScores();

        this.goals.push({
            goalScorerName: scorerName,
            goalSide: this.getTeamName(teamId),
            goalSpeed: this.ballSpeed,
            goalTime: scores.time,
        });
    }

    pointDistance(p1, p2) {
        const d1 = p1.x - p2.x;
        const d2 = p1.y - p2.y;
        return Math.sqrt(d1 * d1 + d2 * d2);
    }

    clearPlayersOffsidePosition(teamId) {
        let offsidePlayers = {};

        if (!teamId) {
            offsidePlayers = { ...this.playersOffsidePosition[RED_TEAM_ID], ...this.playersOffsidePosition[BLUE_TEAM_ID] };

            this.playersOffsidePosition = {
                [RED_TEAM_ID]: {},
                [BLUE_TEAM_ID]: {},
            };
        } else {
            offsidePlayers = { ...this.playersOffsidePosition[teamId] };
            this.playersOffsidePosition[teamId] = {};
        }

        this.clearPlayersAvatars(offsidePlayers);
    }

    clearPlayersAvatars(offsidePlayers) {
        const ids = Object.keys(offsidePlayers);

        for (let i = 0; i < ids.length; i++) {
            const playerId = ids[i];
            const player = this.room.getPlayer(playerId);

            if (player) {
                this.resetPlayerAvatar(player);
            }
        }
    }

    clearTouchingTheBallTimestamp() {
        this.touchingTheBallTimestamps = {};
    }

    clear() {
        this.touchingTheBallTimestamps = {};
        this.ballSpeed = 0;
        this.prevBallPosition = null;
        this.goals = [];
        this.gameStartTimestamp = null;
        this.gameEndTimestamp = null;
        this.tick = 0;
        this.isPaused = false;
        this.votesForUnpause = {};
        this.playersOffsidePosition = {
            [RED_TEAM_ID]: {},
            [BLUE_TEAM_ID]: {},
        };
    }

    resetPlayerAvatar(player) {
        const avatar = playersAvatars[player.name] || player.id;
        this.room.setPlayerAvatar(player.id, `${avatar}`);
    }

    resetTeamToInitPosition(teamId) {
        const playerList = this.getPlayers();

        for (let i = 0; i < playerList.length; i++) {
            const player = playerList[i];

            if (!teamId || (teamId && player.team === teamId)) {
                const initPosition = this.playersInitPosition[player.team][player.id];

                this.room.setPlayerDiscProperties(player.id, {
                    x: initPosition.x,
                    y: initPosition.y,
                    xspeed: 0,
                    yspeed: 0,
                });
            }
        }
    }

    goToGameTab() {
        try {
            const roomLinkElement = this.getRoomLinkElement();
            this.gamePageController = new GamePageController(roomLinkElement.href);
        } catch (error) {
            console.log(error);
        }
    }

    getRoomLinkElement() {
        return $(document.getElementsByTagName('iframe')[0].contentWindow.document.body).find('a')[1];
    }

    waitForRoomLinkElement(callback) {
        const element = this.getRoomLinkElement();

        if (element) {
            callback();
        } else {
            setTimeout(() => {
                this.waitForRoomLinkElement(callback);
            }, 500);
        }
    };

    addSaveReplayButton() {
        if (document.getElementById(SAVE_REPLAY_BUTTON_ID)) {
            return;
        }

        let button = document.createElement("button");
        button.id = SAVE_REPLAY_BUTTON_ID;
        button.innerHTML = "SAVE REPLAY";
        button.onclick = this.saveMatchResult.bind(this);
        button.style.color = '#fff';
        button.style.height = '100px';
        button.style.width = '450px';
        button.style.position = 'fixed';
        button.style.top = '300px';
        button.style.left = '10px';
        button.style.fontSize = '36px';
        button.style.background = 'linear-gradient(#8da86b, #658d59)';
        button.style.border = '4px solid white';
        button.style.borderRadius = '50px';
        button.style.cursor = 'pointer';

        button = document.body.appendChild(button);
    }

    saveMatchResult() {
        try {
            if (this.matchResult) {
                this.client.postMatchResult(this.matchResult, this.handlePostMatchResult.bind(this));
            } else {
                throw new Error('Match not found');
            }
        } catch (error) {
            console.log(error);
        }
    }

    setHostHandicap() {
        this.gamePageController.sendMessage('/handicap ' + HOST_HANDICAP);
    }

}

class GamePageController {

    constructor(pageUrl) {
        this.page = window.open(pageUrl);
    }

    getDocument() {
        return this.page.document.getElementsByTagName('iframe')[0].contentWindow.document;
    }

    getInputBox() {
        return this.getDocument().getElementsByClassName('input')[0];
    }

    getInput() {
        return this.getInputBox().children[0];
    }

    getSendButton() {
        return this.getInputBox().children[1];
    }

    sendMessage(message = '') {
        const input = this.getInput();
        const button = this.getSendButton();

        input.value = message;
        button.click();
    }

    showConfirmModal(message = '') {
        return this.page.confirm(message);
    }

}

class Client {

    getCalculatedTeams(playerList, callback) {
        let url = BACKEND_BASE_URL + 'findTeams?'

        for (let i = 0; i < playerList.length; i++) {
            var player = playerList[i];
            url += 'players[]=' + player.name + '&';
        }

        $.get(url, function (data) {
            callback(data.red, data.blue);
        });
    }

    postMatchResult(matchResult, callback){
        $.ajax({
            type: "POST",
            url: BACKEND_BASE_URL + 'calculatedMatch/new', // move this to const
            dataType: 'application/json',
            data: matchResult,
            success: callback,
        });
    }

}

function init(){
    try {
        console.log('--- starting room ---');
        var haxBallController = new HaxBallController()
        .initRoom()
        .initListeners()
        .initUserInterface()
        ;

        window.haxBallController = haxBallController;
        window.room = haxBallController.getRoom();
        console.log('--- room started ---');
    } catch (error) {
        console.log('fooking error', error);
    }
}

(function() {
    'use strict';
    window.onHBLoaded = init;
})();
