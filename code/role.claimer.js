

const target = require('./all.target');
var roleClaimer = {

    claimer: function (creep){



        if(!creep.memory.transfer){
            var pos = new RoomPosition(3, 24,'W53N12')
            creep.moveTo(pos, {visualizePathStyle: {stroke: '#ffffff'}})
        }
        const transferStation = Game.rooms['W53N12']

        if(creep.room == transferStation){
            creep.memory.transfer =true;
        }
        console.log(creep.memory.transfer)

        if(creep.memory.transfer){
            var pos = new RoomPosition(11, 27,'W54N8')
            creep.moveTo(pos, {visualizePathStyle: {stroke: '#ffffff'}})

            var room = Game.rooms['W54N8']
            if(room){
                creep.claimController(room.controller)
            }
            
        }
        

        // 如果该房间不存在就先往房间走
        //var a = creep.moveTo(roomsite)
       
           
        
            //creep.claimController(creep.room.controller)
        //console.log(a)
            // if (creep.claimController(creep.room.controller) == ERR_NOT_IN_RANGE) {
            //     creep.moveTo(creep.room.controller)
            // }
        // if (!room1) {

        //     creep.moveTo(roomsite1);
        // }
        // else if(!room1){

        //     creep.moveTo(roomsite1)
        //     // 如果房间存在了就说明已经进入了该房间
        //     // 移动到房间的控制器并占领
  
        //     //creep.moveTo(roomsite);
        //     // if (creep.claimController(room.controller) == ERR_NOT_IN_RANGE) {
        //     //     creep.moveTo(room.controller)
        //     // }
        //     // creep.reserveController(room.controller)
        // }else{

        //     creep.reserveController(room.controller)
        // }

    },
    attack: function(creep){
        //var secondRoomStorage = Game.getObjectById('630a6644fa0c7fa90271c276');
        var thirdRoomStorage = Game.getObjectById('63149398f169257d3c3d6a47');
        
        var secondRoomStorage = target[1].secondRoom.secondRoomStorage
      
        if(creep.store.getFreeCapacity() > 0) {
            if(creep.withdraw(secondRoomStorage,RESOURCE_ENERGY)== ERR_NOT_IN_RANGE){
                creep.moveTo(secondRoomStorage);
            }
        
        }
        else{
            if(creep.transfer(thirdRoomStorage,RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(thirdRoomStorage);
            }
        }
				
       

    }






};
module.exports = roleClaimer;
