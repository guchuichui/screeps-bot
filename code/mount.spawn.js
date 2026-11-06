const creepsInfo = require('./creeps.info')

module.exports = function () {
    _.assign(Spawn.prototype, spawnExtension)
}
// 自定义的 Creep 的拓展
const spawnExtension = {
    // creep检查
    checkSpawn () { 
        // 自己已经在生成了 / 内存里没有生成队列 / 生产队列为空 就啥都不干
        if(this.spawning){
            // this.room.visual.text(
            //     '🛠️' + this.memory.spawnList[0],
            //     this.pos.x + 1, 
            //     this.pos.y, 
            //     {align: 'left', opacity: 0.8}
            // );
        }
        if (this.spawning || !this.memory.spawnList || this.memory.spawnList.length == 0) return 
        // 进行生成
        const spawnSuccess = this.mainSpawn(this.memory.spawnList[0])
        // 生成成功后移除任务
        if (spawnSuccess) {
            console.log('已进行生成creep任务,移除生产队列第一位:'+this.memory.spawnList[0])
            this.memory.spawnList.shift()          
        }
    },
    // 推送任务
    addTask (taskName) { 
        this.memory.spawnList.push(taskName)
        console.log(this.room.name +'生产队列长度:'+this.memory.spawnList.length)
        return this.memory.spawnList.length
    },
    // 生成实现
    mainSpawn (taskName) {
        // 代码实现...
        
        // creep.memory.role.indexOf("transferA") !=-1
        for (const creepInfo  of creepsInfo) {
            if(taskName.includes(creepInfo.role)){
                var result = this.spawnCreep(creepInfo.bodys, taskName, 
                    {memory: {role: creepInfo.role , number: creepInfo.number ,otherInfo: creepInfo.otherInfo},directions: creepInfo.directions });
                if(result == 0){
                    return true;
                }
            }
        }
    },
    // 其他更多自定义拓展
}