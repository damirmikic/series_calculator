document.addEventListener('DOMContentLoaded', () => {
    const calculateBtn = document.getElementById('calculateBtn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', calculateAllProbabilities);
    }
});

/**
 * Converts a probability to decimal odds, applying a margin.
 * @param {number} prob The true probability (0 to 1).
 * @param {number} margin The bookmaker's margin as a decimal (e.g., 0.05 for 5%).
 * @returns {number|string} The calculated decimal odds.
 */
function probabilityToOdds(prob, margin = 0) {
    if (prob <= 0) return '—'; // Cannot have odds for a 0% chance event
    // The margin is applied to the probability to create the "implied" probability.
    // Odds are the reciprocal of this implied probability.
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
    let finalOutcomes = [];
    const gamesPlayed = currentWinsA + currentWinsB;

    function traverseSeries(winsA, winsB, gameNum, pathProb, breaks) {
        if (winsA === winsNeeded || winsB === winsNeeded) {
            finalOutcomes.push({ winsA, winsB, games: gameNum - 1, prob: pathProb, breaks });
            return;
        }
        if (gameNum > seriesFormat) return;

        const homeTeam = schedule[gameNum - 1];
        const probA_wins = (homeTeam === 'A') ? probs.teamA_wins_at_A : probs.teamA_wins_at_B;
        
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
    };

    finalOutcomes.forEach(outcome => {
        const winner = outcome.winsA === winsNeeded ? teamA_Name : teamB_Name;
        const score = `${outcome.winsA}-${outcome.winsB}`;
        
        results.winner[winner] += outcome.prob;
        results.correctScore[score] = (results.correctScore[score] || 0) + outcome.prob;
        results.exactGames[outcome.games] = (results.exactGames[outcome.games] || 0) + outcome.prob;
        results.totalBreaks[outcome.breaks] = (results.totalBreaks[outcome.breaks] || 0) + outcome.prob;
    });

    // --- 6. DISPLAY RESULTS ---
    displayResults(results, teamA_Name, teamB_Name, seriesFormat, margin);
}

function displayResults(results, teamA, teamB, format, margin) {
    const container = document.getElementById('results-container');
    const toPercent = (p) => (p * 100).toFixed(2) + '%';
    const toOdds = (p) => {
        const odds = probabilityToOdds(p, margin);
        return typeof odds === 'number' ? odds.toFixed(2) : odds;
    };
    
    // --- Render a generic table for a given market ---
    const renderTable = (title, data) => {
        let html = `
            <div class="result-card">
                <h3>${title}</h3>
                <table>
                    <tr><th>Outcome</th><th>Probability</th><th>Odds</th></tr>`;
        data.forEach(row => {
            html += `<tr><td>${row.label}</td><td>${toPercent(row.prob)}</td><td>${toOdds(row.prob)}</td></tr>`;
        });
        html += `</table></div>`;
        return html;
    };

    // --- Prepare data for each market ---
    const winnerData = Object.entries(results.winner).map(([label, prob]) => ({ label, prob }));
    const scoreData = Object.entries(results.correctScore).sort((a,b) => b[1] - a[1]).map(([label, prob]) => ({ label, prob }));
    const exactGamesData = Object.entries(results.exactGames).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).map(([label, prob]) => ({ label: `${label} Games`, prob }));
    const breaksData = Object.entries(results.totalBreaks).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).map(([label, prob]) => ({ label: `${label} Breaks`, prob }));

    // --- Over/Under Games Data ---
    const ouGamesData = [];
    const gamesPlayedArr = Object.keys(results.exactGames).map(Number);
    if(gamesPlayedArr.length > 1) { // Only show O/U if more than one outcome is possible
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
        if (probA > 0.0001 && probA < 0.9999) handicapData.push({label: formatH(teamA, h), prob: probA});
        if (probB > 0.0001 && probB < 0.9999) handicapData.push({label: formatH(teamB, h), prob: probB});
    });

    // --- Render all tables ---
    container.innerHTML = `
        <div class="results-grid">
            ${renderTable('🏆 Series Winner', winnerData)}
            ${renderTable('📊 Final Score', scoreData)}
            ${renderTable('🗓️ Exact Number of Games', exactGamesData)}
            ${ouGamesData.length > 0 ? renderTable('📈 Total Games (Over/Under)', ouGamesData) : ''}
            ${renderTable('✈️ Total Number of Breaks', breaksData)}
            ${handicapData.length > 0 ? renderTable('⚖️ Series Handicap', handicapData) : ''}
        </div>
    `;
}
