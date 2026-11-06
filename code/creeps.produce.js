
var creepsProduce = {

    /** creep make **/
    run: function() {

        for(var name in Memory.creeps) {
            if(name.includes('W58N12')){
                if(!Game.creeps[name]) {
                    if(name.includes('W58N12B')){  Game.spawns['SpawnBot'].addTask(name) }
                    if(name.includes('W58N12T')){  Game.spawns['SpawnTop'].addTask(name) }
                    delete Memory.creeps[name];
                    console.log('移除不存在的 creep memory:', name);
                }
            }
            // if(name.includes('W54N9')){
            //     if(!Game.creeps[name]) {
            //         Game.spawns['W54N9-A'].addTask(name)
            //         delete Memory.creeps[name];
            //         console.log('移除不存在的 creep memory:', name);
            //     }
            // }
            else 
            if(name.includes('W54N8')){
                if(!Game.creeps[name]) {
                    Game.spawns['SpawnW54N8-L'].addTask(name)
                    delete Memory.creeps[name];
                    console.log('移除不存在的 creep memory:', name);
                }
            }
            // else if(name.includes('W51N9')){
            //     if(!Game.creeps[name]) {
            //         Game.spawns['W51N9-A'].addTask(name)
            //         delete Memory.creeps[name];
            //         console.log('移除不存在的 creep memory:', name);
            //     }
            // }
            else if(name.includes('W55N13')){
                if(!Game.creeps[name]) {
                    if(name.includes('W55N13L')){ Game.spawns['SpawnW55N13-L'].addTask(name) }
                    else if(name.includes('W55N13R')){ Game.spawns['SpawnW55N13-R'].addTask(name) }
                    
                    delete Memory.creeps[name];
                    console.log('移除不存在的 creep memory:', name);
                }
            }
            else if(name.includes('W57N13')){
                if(!Game.creeps[name]) { 
                    if(name.includes('W57N13L')){  Game.spawns['SpawnW57N13-L'].addTask(name) }
                    if(name.includes('W57N13R')){  Game.spawns['SpawnW57N13-R'].addTask(name) }
                    //Game.spawns['SpawnW57N13-L'].addTask(name) 
                    delete Memory.creeps[name];
                    console.log('移除不存在的 creep memory:', name);
                }

                
            }

        }

        for (const spawn in Game.spawns) {
            Game.spawns[spawn].checkSpawn()
        }


	}
};

module.exports = creepsProduce;

