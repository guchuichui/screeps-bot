// 将拓展签入 Creep 原型
module.exports = function () {
    _.assign(Creep.prototype, creepExtension)
}

// 自定义的 Creep 的拓展
const creepExtension = {

    buildStructure(){
        var sites = this.room.find(FIND_CONSTRUCTION_SITES);
        if(this.build(sites[0]) == ERR_NOT_IN_RANGE) {
            this.moveTo(sites[0], {visualizePathStyle: {stroke: '#ffffff'}});
        }
    },
    energyTransfer(){
        var targets = this.pos.findInRange(FIND_STRUCTURES,1,{
            filter: (structure) => {
                return ( structure.structureType == STRUCTURE_SPAWN ||
                        structure.structureType == STRUCTURE_EXTENSION ||
                        structure.structureType == STRUCTURE_TOWER ||
                        structure.structureType == STRUCTURE_POWER_SPAWN
                        ) && 
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 ;
            }
        });

        if(targets.length > 0) {
            this.transfer(targets[0],RESOURCE_ENERGY);
        }
    },
    // 自定义敌人检测
    checkEnemy() { 
        // 代码实现...
    },

    pickupTombstones(){
        var tombstones = this.pos.findInRange(FIND_TOMBSTONES,1)    
        if(tombstones.length > 0){
            var a = this.withdraw(tombstones[0],RESOURCE_ENERGY)
            //console.log(a)
        }
    },
    // 填充 extension
    fillExtensionEngry() { 
        // 代码实现...
        var targets = this.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (
                        structure.structureType == STRUCTURE_EXTENSION) && 
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });
        if(targets.length > 0) {
            if(this.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    },
    fillSpawn() { 
        // 代码实现...
        var targets = this.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (
                        structure.structureType == STRUCTURE_SPAWN) && 
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });
        if(targets.length == 0 ){
            return true;
        }
        if(targets.length > 0) {
            if(this.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    },
    fillLab() { 
        // 代码实现...
        var targets = this.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (
                        structure.structureType == STRUCTURE_LAB) && 
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) >= 100;
            }
        });
        if(targets.length == 0 ){
            return true;
        }        
        if(targets.length > 0) {
            if(this.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    },
        // 填充所有 tower
    fillAllStructures() {
        var targets = this.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_SPAWN ||
                        structure.structureType == STRUCTURE_EXTENSION ||
                        structure.structureType == STRUCTURE_LAB ||
                        structure.structureType == STRUCTURE_TOWER) && 
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });
        if(!targets.length){
            return true;
        }            
        if(targets.length) {
            if(this.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }

    },
    fillTower() {
        var targets = this.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (
                        structure.structureType == STRUCTURE_TOWER) && 
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 100;
            }
        });
        if(!targets.length ){
            return true;
        }            
        if(targets.length) {
            if(this.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }

    },
    //采集能量
    harvestEnergy(id){
        const sources = Game.getObjectById(id)
            if(sources.energy > 0){
                if(this.harvest(sources) == ERR_NOT_IN_RANGE) {
                    this.moveTo(sources, {visualizePathStyle: {stroke: '#ffaa00'}});               
                }
            }
    },

    stateChange(){
        if(this.memory.state && this.store.getUsedCapacity() == 0) {
            this.memory.state = false;
            this.say('🔄F');
	    }
	    if(!this.memory.state && this.store.getFreeCapacity() == 0) {
	        this.memory.state = true;
	        this.say('🚧T');
	    }
    },

    // 其他更多自定义拓展
}