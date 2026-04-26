document.addEventListener('DOMContentLoaded', () => {
    const calculateBtn = document.getElementById('calculateBtn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', calculateAllProbabilities);
    }
});

/**
 * Converts a probability to decimal odds, applying a bookmaker margin.
 * @param {number} prob The true probability (0 to 1).
 * @param {number} margin The bookmaker's margin as a decimal (e.g., 0.05 for 5%).
 * @returns {number|string} The calculated decimal odds.
 */
function probabilityToOdds(prob, margin = 0) {
    if (prob <= 0) return '—';
    const impliedProb = prob * (1 + margin);
    return 1 / impliedProb;
}

function calculateAllProbabilities() {
    // --- 1. GET USER INPUTS ---
    const teamA_Name = document.getElementById('teamA').value || 'Team A';
    const teamB_Name = document.getElementById('teamB').value || 'Team B';
    const seriesFormat = parseInt(document.getElementById('seriesFormat').value);
    const margin = (parseFloat(document.getElementById('margin').value) || 0) / 100;
    const winsNeeded = Math.ceil(seriesFormat / 2);

    const currentWinsA = parseInt(document.getElementById('currentWinsA').value) || 0;
    const currentWinsB = parseInt(document.getElementById('currentWinsB').value) || 0;
    const breaksSoFar = parseInt(document.getElementById('breaksSoFar').value) || 0;

    const odds = {
        a_home: parseFloat(document.getElementById('oddsA_home').value),
        b_away: parseFloat(document.getElementById('oddsB_away').value),
        a_away: parseFloat(document.getElementById('oddsA_away').value),
        b_home: parseFloat(document.getElementById('oddsB_home').value),
    };

    // --- INPUT VALIDATION ---
    const container = document.getElementById('results-container');
    if (Object.values(odds).some(o => isNaN(o) || o <= 1)) {
        container.innerHTML = `<div class="result-card info">Error: Please enter valid odds (must be a number greater than 1).</div>`;
        return;
    }
    if (currentWinsA >= winsNeeded || currentWinsB >= winsNeeded) {
        const winner = currentWinsA >= winsNeeded ? teamA_Name : teamB_Name;
        container.innerHTML = `<div class="result-card info">The series is already over. Winner: <strong>${winner}</strong></div>`;
        return;
    }
    if (currentWinsA < 0 || currentWinsB < 0 || breaksSoFar < 0 || breaksSoFar > (currentWinsA + currentWinsB)) {
        container.innerHTML = `<div class="result-card info">Error: Invalid series state. Please check the current wins and breaks.</div>`;
        return;
    }

    // --- 2. NORMALIZE ODDS TO PROBABILITIES ---
    const implied_a_home = 1 / odds.a_home;
    const implied_b_away = 1 / odds.b_away;
    const prob_a_at_home = implied_a_home / (implied_a_home + implied_b_away);

    const implied_a_away = 1 / odds.a_away;
    const implied_b_home = 1 / odds.b_home;
    const prob_a_at_b_home = implied_a_away / (implied_a_away + implied_b_home);

    const probs = {
        teamA_wins_at_A: prob_a_at_home,
        teamA_wins_at_B: prob_a_at_b_home,
    };

    // --- 3. DEFINE HOME/AWAY SCHEDULE ---
    const schedule = {
        3: ['A', 'A', 'B'],
        5: ['A', 'A', 'B', 'B', 'A'],
        7: ['A', 'A', 'B', 'B', 'A', 'B', 'A']
    }[seriesFormat];

    // --- 4. RUN RECURSIVE SIMULATION ---
    const finalOutcomes = [];
    const gamesPlayed = currentWinsA + currentWinsB;

    function traverseSeries(winsA, winsB, gameNum, pathProb, breaks) {
        if (winsA === winsNeeded || winsB === winsNeeded) {
            finalOutcomes.push({ winsA, winsB, games: gameNum - 1, prob: pathProb, breaks });
            return;
        }
        if (gameNum > seriesFormat) return;

        const homeTeam = schedule[gameNum - 1];
        const probA_wins = homeTeam === 'A' ? probs.teamA_wins_at_A : probs.teamA_wins_at_B;

        traverseSeries(winsA + 1, winsB, gameNum + 1, pathProb * probA_wins, breaks + (homeTeam === 'B' ? 1 : 0));
        traverseSeries(winsA, winsB + 1, gameNum + 1, pathProb * (1 - probA_wins), breaks + (homeTeam === 'A' ? 1 : 0));
    }

    traverseSeries(currentWinsA, currentWinsB, gamesPlayed + 1, 1.0, breaksSoFar);

    // --- 5. AGGREGATE RESULTS ---
    const results = {
        winner: { [teamA_Name]: 0, [teamB_Name]: 0 },
        correctScore: {},
        exactGames: {},
        totalBreaks: {},
        expectedGames: 0,
        expectedBreaks: 0,
    };

    finalOutcomes.forEach(outcome => {
        const winner = outcome.winsA === winsNeeded ? teamA_Name : teamB_Name;
        const score = `${outcome.winsA}-${outcome.winsB}`;

        results.winner[winner] += outcome.prob;
        results.correctScore[score] = (results.correctScore[score] || 0) + outcome.prob;
        results.exactGames[outcome.games] = (results.exactGames[outcome.games] || 0) + outcome.prob;
        results.totalBreaks[outcome.breaks] = (results.totalBreaks[outcome.breaks] || 0) + outcome.prob;
        results.expectedGames += outcome.games * outcome.prob;
        results.expectedBreaks += outcome.breaks * outcome.prob;
    });

    // --- 5b. GAME-BY-GAME CONDITIONAL PROBABILITIES ---
    // For each remaining game: P(game is played) and P(Team A wins | game is played).
    const gameByGame = {};
    function traverseGameByGame(winsA, winsB, gameNum, pathProb) {
        if (winsA === winsNeeded || winsB === winsNeeded || gameNum > seriesFormat) return;
        const homeTeam = schedule[gameNum - 1];
        const probA_wins = homeTeam === 'A' ? probs.teamA_wins_at_A : probs.teamA_wins_at_B;
        if (!gameByGame[gameNum]) gameByGame[gameNum] = { probPlayed: 0, probAWins: 0, homeTeam };
        gameByGame[gameNum].probPlayed += pathProb;
        gameByGame[gameNum].probAWins += pathProb * probA_wins;
        traverseGameByGame(winsA + 1, winsB, gameNum + 1, pathProb * probA_wins);
        traverseGameByGame(winsA, winsB + 1, gameNum + 1, pathProb * (1 - probA_wins));
    }
    traverseGameByGame(currentWinsA, currentWinsB, gamesPlayed + 1, 1.0);

    // --- 6. DISPLAY RESULTS ---
    displayResults(results, teamA_Name, teamB_Name, seriesFormat, margin, winsNeeded, gameByGame);
}

function displayResults(results, teamA, teamB, format, margin, winsNeeded, gameByGame) {
    const container = document.getElementById('results-container');
    const toPercent = (p) => (p * 100).toFixed(2) + '%';
    const toOdds = (p) => {
        const odds = probabilityToOdds(p, margin);
        return typeof odds === 'number' ? odds.toFixed(2) : odds;
    };
    const probClass = (p) => p >= 0.5 ? 'prob-high' : p >= 0.25 ? 'prob-mid' : 'prob-low';

    const renderTable = (title, data) => {
        if (data.length === 0) return '';
        const maxProb = Math.max(...data.map(r => r.prob));
        let html = `
            <div class="result-card">
                <h3>${title}</h3>
                <table>
                    <tr><th>Outcome</th><th>Probability</th><th>Odds</th></tr>`;
        data.forEach(row => {
            const barWidth = maxProb > 0 ? ((row.prob / maxProb) * 100).toFixed(1) : 0;
            const cls = probClass(row.prob);
            html += `
                <tr>
                    <td>${row.label}</td>
                    <td>
                        <div class="prob-cell ${cls}">
                            <div class="prob-bar"><div class="prob-fill" style="width:${barWidth}%"></div></div>
                            <span class="prob-text">${toPercent(row.prob)}</span>
                        </div>
                    </td>
                    <td>${toOdds(row.prob)}</td>
                </tr>`;
        });
        html += `</table></div>`;
        return html;
    };

    // --- Prepare data for each market ---
    const winnerData = Object.entries(results.winner).map(([label, prob]) => ({ label, prob }));

    // Label scores with the winning team's name for clarity (e.g. "Team A 4–1")
    const scoreData = Object.entries(results.correctScore)
        .sort((a, b) => b[1] - a[1])
        .map(([score, prob]) => {
            const [wA, wB] = score.split('-').map(Number);
            const label = wA === winsNeeded ? `${teamA} ${wA}–${wB}` : `${teamB} ${wB}–${wA}`;
            return { label, prob };
        });

    const exactGamesData = Object.entries(results.exactGames)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .map(([label, prob]) => ({ label: `${label} Games`, prob }));
    const breaksData = Object.entries(results.totalBreaks)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .map(([label, prob]) => ({ label: `${label} Breaks`, prob }));

    // --- Over/Under Games Data ---
    const ouGamesData = [];
    const gamesPlayedArr = Object.keys(results.exactGames).map(Number);
    if (gamesPlayedArr.length > 1) {
        const minGames = Math.min(...gamesPlayedArr);
        for (let i = minGames; i < format; i++) {
            const threshold = i + 0.5;
            let overProb = 0;
            Object.entries(results.exactGames).forEach(([games, prob]) => {
                if (parseInt(games) > threshold) overProb += prob;
            });
            if (overProb > 0.0001 && overProb < 0.9999) {
                ouGamesData.push({ label: `Over ${threshold} Games`, prob: overProb });
                ouGamesData.push({ label: `Under ${threshold} Games`, prob: 1 - overProb });
            }
        }
    }

    // --- Handicap Data ---
    const handicapData = [];
    const handicaps = [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5];
    handicaps.forEach(h => {
        let probA = 0, probB = 0;
        Object.entries(results.correctScore).forEach(([score, prob]) => {
            const [winsA, winsB] = score.split('-').map(Number);
            if (winsA - winsB > h) probA += prob;
            if (winsB - winsA > h) probB += prob;
        });
        const formatH = (team, val) => `${team} ${val > 0 ? '+' : ''}${val}`;
        if (probA > 0.0001 && probA < 0.9999) handicapData.push({ label: formatH(teamA, h), prob: probA });
        if (probB > 0.0001 && probB < 0.9999) handicapData.push({ label: formatH(teamB, h), prob: probB });
    });

    // --- Summary Statistics ---
    const gameNums = Object.keys(results.exactGames).map(Number);
    const minGames = Math.min(...gameNums);
    const maxGames = Math.max(...gameNums);
    const probA = results.winner[teamA];
    const sweepProb = results.exactGames[minGames] || 0;
    const deciderProb = results.exactGames[maxGames] || 0;

    const summaryHTML = `
        <div class="result-card summary-card">
            <h3>Summary Statistics</h3>
            <div class="summary-stats">
                <div class="stat">
                    <div class="stat-value ${probClass(probA)}">${toPercent(probA)}</div>
                    <div class="stat-label">${teamA} series win</div>
                </div>
                <div class="stat">
                    <div class="stat-value ${probClass(1 - probA)}">${toPercent(1 - probA)}</div>
                    <div class="stat-label">${teamB} series win</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${results.expectedGames.toFixed(2)}</div>
                    <div class="stat-label">Expected games</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${results.expectedBreaks.toFixed(2)}</div>
                    <div class="stat-label">Expected breaks</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${toPercent(sweepProb)}</div>
                    <div class="stat-label">Sweep (${minGames} games)</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${toPercent(deciderProb)}</div>
                    <div class="stat-label">Full ${maxGames} games</div>
                </div>
            </div>
        </div>`;

    // --- Individual Game Probabilities ---
    // Shows P(game is played) and conditional P(each team wins) for each remaining game.
    const gameByGameHTML = (() => {
        const entries = Object.entries(gameByGame)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        if (entries.length === 0) return '';
        let html = `
            <div class="result-card full-width">
                <h3>Individual Game Probabilities</h3>
                <table>
                    <tr><th>Game</th><th>Home</th><th>P(Played)</th><th>${teamA} Wins</th><th>${teamB} Wins</th></tr>`;
        entries.forEach(([gameNum, g]) => {
            const probAWins = g.probAWins / g.probPlayed;
            const probBWins = 1 - probAWins;
            const homeLabel = g.homeTeam === 'A' ? teamA : teamB;
            html += `
                <tr>
                    <td>Game ${gameNum}</td>
                    <td>${homeLabel}</td>
                    <td>${toPercent(g.probPlayed)}</td>
                    <td><span class="game-prob ${probClass(probAWins)}">${toPercent(probAWins)}</span><span class="game-odds">${toOdds(probAWins)}</span></td>
                    <td><span class="game-prob ${probClass(probBWins)}">${toPercent(probBWins)}</span><span class="game-odds">${toOdds(probBWins)}</span></td>
                </tr>`;
        });
        html += `</table></div>`;
        return html;
    })();

    // --- Render all tables ---
    container.innerHTML = `
        <div class="results-grid">
            ${summaryHTML}
            ${renderTable('Series Winner', winnerData)}
            ${renderTable('Final Score', scoreData)}
            ${renderTable('Exact Number of Games', exactGamesData)}
            ${ouGamesData.length > 0 ? renderTable('Total Games — Over / Under', ouGamesData) : ''}
            ${renderTable('Total Number of Breaks', breaksData)}
            ${handicapData.length > 0 ? renderTable('Series Handicap', handicapData) : ''}
            ${gameByGameHTML}
        </div>
    `;
}
