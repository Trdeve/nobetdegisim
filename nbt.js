const express = require('express');
const ExcelJS = require('exceljs');
const app = express();
const PORT = 3000;
const FILE_PATH = 'veriler.xlsx'; // Excel dosyası yolu

app.use(express.json());

// Excel dosyasını okuma
async function readExcelData() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    const sheet = workbook.getWorksheet(1);

    const data = [];
    sheet.eachRow((row, rowIndex) => {
        if (rowIndex > 1) {
            const person = row.getCell(1).value;
            const shifts = [];
            for (let i = 2; i <= 32; i++) {
                shifts.push(row.getCell(i).value);
            }
            data.push({ person, shifts });
        }
    });

    return data;
}

// Kural Kontrolleri
function isSuitable(aShifts, bShifts, aShiftIndex, bShiftIndex) {
    // Kural 1: A kişisi için y günü ve B kişisi için x_1 günü boş (null) olmalı
    if (aShifts[bShiftIndex] !== null || bShifts[aShiftIndex] !== null) return false;

    // Kural 2: A kişisinin y günü, bir önceki ve sonraki günlerde sayısal değer olmamalı (x_1 günü hariç)
    if (
        (bShiftIndex > 0 && bShiftIndex - 1 !== aShiftIndex && aShifts[bShiftIndex - 1] !== null) || 
        (bShiftIndex < 30 && bShiftIndex + 1 !== aShiftIndex && aShifts[bShiftIndex + 1] !== null)
    ) return false;

    // Kural 3: B kişisinin x_1 günü, bir önceki ve sonraki günlerde sayısal değer olmamalı (y günü hariç)
    if (
        (aShiftIndex > 0 && aShiftIndex - 1 !== bShiftIndex && bShifts[aShiftIndex - 1] !== null) || 
        (aShiftIndex < 30 && aShiftIndex + 1 !== bShiftIndex && bShifts[aShiftIndex + 1] !== null)
    ) return false;

    return true;
}


// A kişisinin yalnızca sayısal nöbet günlerini alma
function getNumericShifts(shifts) {
    return shifts
        .map((shift, index) => (!isNaN(shift) && shift !== null ? index + 1 : null))
        .filter(day => day !== null);
}

// Uygun nöbet günlerini bulma
function findSuitableShifts(data, selectedPerson, selectedShiftIndex) {
    const selectedPersonData = data.find(d => d.person === selectedPerson);
    if (!selectedPersonData) throw new Error('Seçilen kişi bulunamadı.');

    const result = [];

    data.forEach(personData => {
        if (personData.person !== selectedPerson) {
            const bShifts = personData.shifts;
            const availableShifts = [];

            bShifts.forEach((shift, index) => {
                if (isSuitable(selectedPersonData.shifts, bShifts, selectedShiftIndex, index)) {
                    availableShifts.push(index + 1);
                }
            });

            // Yalnızca B kişisinin sahip olduğu nöbet günleri arasında olanları filtrele
            if (availableShifts.length > 0) {
                const bPersonShifts = getNumericShifts(bShifts);
                const validShifts = availableShifts.filter(day => bPersonShifts.includes(day));
                if (validShifts.length > 0) {
                    result.push({ person: personData.person, shifts: validShifts });
                }
            }
        }
    });

    return result;
}



// API Endpoints
app.get('/api/persons', async (req, res) => {
    const data = await readExcelData();
    const persons = data.map(d => d.person);
    res.json(persons);
});

app.get('/api/shifts', async (req, res) => {
    const { person } = req.query;
    const data = await readExcelData();
    const personData = data.find(d => d.person === person);
    if (!personData) return res.status(404).json({ error: 'Kişi bulunamadı' });

    // Sadece sayısal nöbet günleri döndürülüyor
    const numericShifts = getNumericShifts(personData.shifts);
    res.json(numericShifts);
});

app.post('/api/suitable', async (req, res) => {
    const { person, shift } = req.body; // shiftIndex yerine shift olarak güncellendi
    const data = await readExcelData();
    const suitableShifts = findSuitableShifts(data, person, shift - 1);

    // B kişileri ve onların uygun Y nöbetlerini döndür
    res.json(suitableShifts);
});

// Frontend'i Sunma
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nöbet Değişim</title>
    </head>
    <body>
        <h1>Nöbet Değişim Uygulaması</h1>

        <label for="person">Kişi Seçin:</label>
        <select id="person"></select>

        <label for="shift">Nöbet Seçin:</label>
        <select id="shift"></select>

        <button id="check">Uygunluğu Kontrol Et</button>

        <h2>Sonuçlar:</h2>
        <div id="results"></div>

        <script>
            async function fetchPersons() {
                const response = await fetch('/api/persons');
                return response.json();
            }

            async function fetchShifts(person) {
                const response = await fetch(\`/api/shifts?person=\${person}\`);
                return response.json();
            }

            async function checkSuitability(person, shift) {
                const response = await fetch('/api/suitable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ person, shift: parseInt(shift) }) // Shift değerini tamsayıya çevirme
                });
                return response.json();
            }

            document.getElementById('person').addEventListener('change', async (e) => {
                const person = e.target.value;
                const shifts = await fetchShifts(person);
                const shiftSelect = document.getElementById('shift');
                shiftSelect.innerHTML = shifts.map(day => \`<option value="\${day}">\${day}. Gün</option>\`).join('');
            });

            document.getElementById('check').addEventListener('click', async () => {
                const person = document.getElementById('person').value;
                const shift = document.getElementById('shift').value;

                const results = await checkSuitability(person, shift);
                const resultsDiv = document.getElementById('results');
                resultsDiv.innerHTML = results.map(r => \`<div>\${r.person} için uygun nöbetler: \${r.shifts.join(', ')}</div>\`).join('');
            });

            (async () => {
                const persons = await fetchPersons();
                const personSelect = document.getElementById('person');
                personSelect.innerHTML = persons.map(person => \`<option value="\${person}">\${person}</option>\`).join('');
            })();
        </script>
    </body>
    </html>
    `);
});

// Sunucu Başlatma
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
