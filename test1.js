const query = 'awp asiimov';
const lowerQuery = query.toLowerCase();
const queryClean = lowerQuery.replace(/[^a-z0-9]/g, '');

const mockItems = [
    { name: 'AWP | Asiimov (Field-Tested)' },
    { name: 'StatTrak™ AWP | Asiimov (Field-Tested)' },
    { name: 'P90 | Trigon (Minimal Wear)' },
    { name: 'M4A4 | Asiimov (Field-Tested)' }
];

mockItems.sort((a, b) => b.name.length - a.name.length);

const matchedItem = mockItems.find(item => {
    const nameLower = item.name.toLowerCase();
    if (lowerQuery.includes(nameLower)) return true;

    // Try omitting wear condition (e.g. "(Field-Tested)")
    const baseName = nameLower.split('(')[0].trim();
    if (baseName.length > 4 && lowerQuery.includes(baseName)) return true;

    // Try without the pipe (e.g. "ak-47 redline")
    const noPipe = baseName.replace('|', '').replace(/\s+/g, ' ').trim();
    if (noPipe.length > 4 && lowerQuery.includes(noPipe)) return true;

    // Try fully compressed (e.g. "ak47redline")
    const compressedName = baseName.replace(/[^a-z0-9]/g, '');
    if (compressedName.length > 4 && queryClean.includes(compressedName)) return true;

    // 5. Check if query is fully contained within compressedName:
    // User says "awp asiimov" -> "awpasiimov". Item is "AWP | Asiimov (Field-Tested)" -> "awpasiimovfieldtested".
    // Does compressedName include queryClean? 
    if (queryClean.length > 4 && compressedName.includes(queryClean)) {
        console.log('Matched via compressedName.includes:', compressedName, 'includes', queryClean);
        return true;
    }

    return false;
});

console.log('Matched:', matchedItem?.name);
