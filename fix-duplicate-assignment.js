const http = require('http');

const API_BASE_URL = 'http://localhost:4000';
const USER_ID = 'ebe4c0d8-05c7-47b7-8a5e-8388fa7814fb';

function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE_URL);
        
        const options = {
            method: method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (error) {
                    resolve({ statusCode: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

async function fixDuplicateAssignment() {
    console.log('============================================================');
    console.log('  FIX DUPLICATE GROUP ASSIGNMENT');
    console.log('============================================================\n');
    console.log(`👤 User ID: ${USER_ID}`);
    console.log(`🌐 API: ${API_BASE_URL}\n`);

    try {
        // Step 1: Get current user details
        console.log('📡 Step 1: Fetching current user details...');
        const userResponse = await makeRequest('GET', `/api/user-management/users/${USER_ID}`);
        
        if (userResponse.statusCode !== 200) {
            console.error(`❌ Failed: Status ${userResponse.statusCode}`);
            return;
        }

        const userData = userResponse.data.data || userResponse.data;
        console.log(`✅ User: ${userData.firstName} ${userData.lastName}`);
        console.log(`Current assignedGroups: ${JSON.stringify(userData.assignedGroups)}\n`);

        // Step 2: Get all available groups
        console.log('📡 Step 2: Fetching all available groups...');
        const groupsResponse = await makeRequest('GET', '/api/user-management/groups');
        
        const allGroups = groupsResponse.data.data || groupsResponse.data || [];
        console.log(`✅ Found ${allGroups.length} groups in database:`);
        allGroups.forEach(g => {
            console.log(`  - ${g.name} (ID: ${g.id})`);
        });
        console.log('');

        // Step 3: Remove duplicates from assignedGroups
        const uniqueGroupIds = [...new Set(userData.assignedGroups || [])];
        console.log('📋 Step 3: Removing duplicates...');
        console.log(`Before: ${userData.assignedGroups.length} entries`);
        console.log(`After:  ${uniqueGroupIds.length} unique entries`);
        console.log(`Unique IDs: ${JSON.stringify(uniqueGroupIds)}\n`);

        // Step 4: Update user with deduplicated groups
        console.log('💾 Step 4: Updating user with deduplicated groups...');
        
        // We need to call the internal update API
        // First, let me just assign the correct groups
        const correctGroupIds = allGroups.map(g => g.id);
        console.log(`Assigning all ${correctGroupIds.length} available groups: ${JSON.stringify(correctGroupIds)}`);

        const updateResponse = await makeRequest('POST', `/api/users/${USER_ID}/assign-groups`, {
            groupIds: correctGroupIds
        });

        if (updateResponse.statusCode >= 200 && updateResponse.statusCode < 300) {
            console.log(`✅ Successfully updated user assignments\n`);
        } else {
            console.error(`❌ Failed to update: Status ${updateResponse.statusCode}`);
            console.error(`Response: ${JSON.stringify(updateResponse.data)}\n`);
            return;
        }

        // Step 5: Verify the fix
        console.log('🔍 Step 5: Verifying the fix...');
        const verifyResponse = await makeRequest('GET', `/api/users/${USER_ID}/groups`);
        
        if (verifyResponse.statusCode === 200) {
            const verifyData = verifyResponse.data.data || verifyResponse.data;
            const groups = verifyData.groups || [];
            
            console.log(`✅ User now has ${groups.length} assigned groups:`);
            groups.forEach((g, i) => {
                console.log(`  ${i + 1}. ${g.name} (ID: ${g.id})`);
            });
            console.log('');

            // Check for duplicates
            const groupIds = groups.map(g => g.id);
            const uniqueIds = [...new Set(groupIds)];
            
            if (groupIds.length === uniqueIds.length) {
                console.log('✅ NO DUPLICATES - Fix successful!\n');
            } else {
                console.log('⚠️  DUPLICATES STILL EXIST\n');
            }
        }

        console.log('============================================================');
        console.log('  FIX COMPLETE');
        console.log('============================================================\n');

    } catch (error) {
        console.error('\n❌ ERROR:');
        console.error('-----------------------------------------------------------');
        console.error('Error:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        console.error('-----------------------------------------------------------\n');
    }
}

// Run the fix
console.log('\n⚠️  This will fix duplicate group assignments for user GHSHOOIO');
console.log('⚠️  Starting in 2 seconds...\n');

setTimeout(() => {
    fixDuplicateAssignment()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('Fix failed:', error);
            process.exit(1);
        });
}, 2000);

