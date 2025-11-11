import { GroupsService } from './src/services/groups';
import fs from 'fs';
import path from 'path';

async function debugGroupsService() {
    try {
        console.log('🔧 Debugging Groups Service...');
        
        // Check if data directory exists
        const dataDir = path.join(process.cwd(), 'data');
        console.log('Data directory:', dataDir);
        console.log('Data directory exists:', fs.existsSync(dataDir));
        
        // Check groups.json file
        const groupsFile = path.join(dataDir, 'groups.json');
        console.log('Groups file path:', groupsFile);
        console.log('Groups file exists:', fs.existsSync(groupsFile));
        
        if (fs.existsSync(groupsFile)) {
            const content = fs.readFileSync(groupsFile, 'utf8');
            console.log('Current file content:', content);
        }
        
        // Test the service
        const groupsService = new GroupsService('./data');
        
        console.log('\nTesting list method...');
        const beforeList = groupsService.list();
        console.log('Groups before creating:', beforeList.length);
        
        console.log('\nTesting create method...');
        const testGroup = groupsService.create({
            name: 'Test Group',
            description: 'Test description'
        });
        console.log('Created group:', testGroup);
        
        console.log('\nTesting list after create...');
        const afterList = groupsService.list();
        console.log('Groups after creating:', afterList.length);
        afterList.forEach(group => {
            console.log(`- ${group.name} (${group.id})`);
        });
        
        // Check file content again
        if (fs.existsSync(groupsFile)) {
            const newContent = fs.readFileSync(groupsFile, 'utf8');
            console.log('\nNew file content:', newContent);
        }
        
    } catch (error) {
        console.error('❌ Debug error:', error);
    }
}

debugGroupsService();