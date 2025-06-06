document.addEventListener('DOMContentLoaded', () => {
    const calculateBtn = document.getElementById('calculateBtn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', calculateAllProbabilities);
    }
});

function calculateAllProbabilities() {
    // --- 1. GET USER INPUTS ---
    const teamA_Name = document.getElementById('teamA').value || 'Team A';
    const teamB_Name = document.getElementById('teamB').value || 'Team B';
    const seriesFormat = parseInt(document.getElementById('seriesFormat').value);
    const winsNeeded = Math.ceil(seriesFormat / 2);

    const odds = {
        a_home: parseFloat(document.getElementById('oddsA_home').value),
        b_away: parseFloat(document.getElementById('oddsB_away').value),
        a_away: parseFloat(document.getElementById('oddsA_away').value),
        b_home: parseFloat(document.getElementById('oddsB_home').value),
    };

    if (Object.values(odds).some(o => isNaN(o) || o <= 1)) {
        alert('Please enter valid odds (must be a number greater than 1).');
        return;
    }

    // --- 2. NORMALIZE ODDS TO PROBABILITIES (removes bookmaker's margin) ---
    const implied_a_home = 1 / odds.a_home;
    const implied_b_away = 1 / odds.b_away;
    const prob_a_at_home = implied_a_home / (implied_a_home + implied_b_away);
    const prob_b_at_a_home = 1 - prob_a_at_home;

    const implied_a_away = 1 / odds.a_away;
    const implied_b_home = 1 / odds.b_home;
    const prob_a_at_b_home = implied_a_away / (implied_a_away + implied_b_home);
    const prob_b_at_b_home = 1 - prob_a_at_b_home;
    
    const probs = {
        teamA_wins_at_A: prob_a_at_home,
        teamB_wins_at_A: prob_b_at_a_home,
        teamA_wins_at_B: prob_a_at_b_home,
        teamB_wins_at_B: prob_b_at_b_home,
    };

    // --- 3. DEFINE HOME/AWAY SCHEDULE ---
    const schedule = {
        3: ['A', 'A', 'B'],
        5: ['A', 'A', 'B', 'B', 'A'],
        7: ['A', 'A', 'B', 'B', 'A', 'B', 'A']
    }[seriesFormat];

    // --- 4. RUN RECURSIVE SIMULATION ---
    let finalOutcomes = [];

    function traverseSeries(winsA, winsB, gameNum, pathProb, breaks) {
        // Base case: Series is over
        if (winsA === winsNeeded || winsB === winsNeeded) {
            finalOutcomes.push({
                winsA,
                winsB,
                games: gameNum - 1,
                prob: pathProb,
                breaks
            });
            return;
        }

        const homeTeam = schedule[gameNum - 1];
        const probA_wins = (homeTeam === 'A') ? probs.teamA_wins_at_A : probs.teamA_wins_at_B;

        // Path 1: Team A wins the current game
        traverseSeries(winsA + 1, winsB, gameNum + 1, pathProb * probA_wins, breaks + (homeTeam === 'B' ? 1 : 0));
        
        // Path 2: Team B wins the current game
        traverseSeries(winsA, winsB + 1, gameNum + 1, pathProb * (1 - probA_wins), breaks + (homeTeam === 'A' ? 1 : 0));
    }

    traverseSeries(0, 0, 1, 1.0, 0);

    // --- 5. AGGREGATE RESULTS ---
    const results = {
        winner: { [teamA_Name]: 0, [teamB_Name]: 0 },
        correctScore: {},
        totalGames: {},
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
    displayResults(results, teamA_Name, teamB_Name, seriesFormat);
}

function displayResults(results, teamA, teamB, format) {
    const container = document.getElementById('results-container');
    const toPercent = (p) => (p * 100).toFixed(2) + '%';
    
    // --- Series Winner & Correct Score ---
    let winnerHtml = `
        <div class="result-card">
            <h3>🏆 Series Winner</h3>
            <table>
                <tr><th>Team</th><th>Probability</th></tr>
                <tr><td>${teamA}</td><td>${toPercent(results.winner[teamA])}</td></tr>
                <tr><td>${teamB}</td><td>${toPercent(results.winner[teamB])}</td></tr>
            </table>
        </div>
        <div class="result-card">
            <h3>📊 Correct Score</h3>
            <table>
                <tr><th>Final Score</th><th>Probability</th></tr>`;
    Object.entries(results.correctScore).sort((a,b) => b[1] - a[1]).forEach(([score, prob]) => {
        winnerHtml += `<tr><td>${score}</td><td>${toPercent(prob)}</td></tr>`;
    });
    winnerHtml += `</table></div>`;

    // --- Exact Games & Totals ---
    let gamesHtml = `
        <div class="result-card">
            <h3>🗓️ Exact Number of Games</h3>
            <table>
                <tr><th>Games Played</th><th>Probability</th></tr>`;
    Object.entries(results.exactGames).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).forEach(([games, prob]) => {
        gamesHtml += `<tr><td>${games}</td><td>${toPercent(prob)}</td></tr>`;
    });
    gamesHtml += `</table></div><div class="result-card"><h3>📈 Total Games (Over/Under)</h3><table>
                    <tr><th>Market</th><th>Probability</th></tr>`;
    
    // Calculate Over/Under for games
    for (let i = format - 1; i < format; i++) {
        const threshold = i + 0.5;
        let overProb = 0;
        let underProb = 0;
        Object.entries(results.exactGames).forEach(([games, prob]) => {
            if (parseInt(games) > threshold) overProb += prob;
            else underProb += prob;
        });
        if (overProb > 0.0001 && underProb > 0.0001) {
             gamesHtml += `<tr><td>Over ${threshold}</td><td>${toPercent(overProb)}</td></tr>`;
             gamesHtml += `<tr><td>Under ${threshold}</td><td>${toPercent(underProb)}</td></tr>`;
        }
    }
    gamesHtml += `</table></div>`;

    // --- Breaks & Handicap ---
    let breaksHtml = `
        <div class="result-card">
            <h3>✈️ Exact Number of Breaks</h3>
            <table>
                <tr><th>Breaks</th><th>Probability</th></tr>`;
    Object.entries(results.totalBreaks).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).forEach(([breaks, prob]) => {
        breaksHtml += `<tr><td>${breaks}</td><td>${toPercent(prob)}</td></tr>`;
    });
    breaksHtml += `</table></div><div class="result-card"><h3>⚖️ Series Handicap</h3><table>
                <tr><th>Handicap</th><th>Probability</th></tr>`;

    // Calculate Handicap
    const handicaps = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
    handicaps.forEach(h => {
        let probA = 0;
        let probB = 0;
        Object.entries(results.correctScore).forEach(([score, prob]) => {
            const [winsA, winsB] = score.split('-').map(Number);
            if (winsA - winsB > h) probA += prob;
            if (winsB - winsA > h) probB += prob;
        });

        if (probA > 0.0001 && probA < 0.9999) {
            breaksHtml += `<tr><td>${teamA} ${h > 0 ? '+' : ''}${h}</td><td>${toPercent(probA)}</td></tr>`;
        }
         if (probB > 0.0001 && probB < 0.9999) {
            breaksHtml += `<tr><td>${teamB} ${h > 0 ? '+' : ''}${h}</td><td>${toPercent(probB)}</td></tr>`;
        }
    });
    breaksHtml += `</table></div>`;

    container.innerHTML = `<div class="results-grid">${winnerHtml}${gamesHtml}${breaksHtml}</div>`;
}
