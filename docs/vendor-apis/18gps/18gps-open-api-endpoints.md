# 18GPS Open API: Endpoint Reference (v2021.5)

Companion to `18gps-open-api-brief.md`. Read the brief first (auth flow, traps, error codes, alarm codes).

Conventions
- Base URL (production): `api.18gps.net`. Test: `apitest.18gps.net`. The source says to prepare your own domain for calls (域名请自备) and also lists these two hosts, so confirm which host and HTTPS support apply to TD IT.
- Most calls are `GET .../GetDateServices.asmx/GetDate?method=<Name>&mds=<token>&...` (or `GetDataService.aspx`). The source says GET or POST both work.
- Parameter tables and developer notes keep the **original Chinese text** so nothing is lost in translation. English endpoint titles were added. Table headings: 参数 = parameter, 类型 = type, 必填 = required (是 yes / 否 no), 描述 or 说明 = description.
- `<MDS>`, `<LOGIN_NAME>`, `<PASSWORD>`, `<PHONE>` are placeholders where the source contained real-looking test values.
- `Guid` values are 32-character ids. All times are 13-digit UTC milliseconds.


---

## Part 1: Preface


---

## Part 2: Mobile (end-user) API

### Login (get the `mds` token)
*Original heading: 1.登录*

- **Endpoint:** `url/GetDateServices.asmx/loginSystem`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/loginSystem?LoginName=<LOGIN_NAME>&LoginPassword=<PASSWORD>&LoginType=ENTERPRISE&language=cn&ISMD5=0&timeZone=+08&apply=APP&loginUrl=http://vipapi.18gps.net/
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| LoginName | String | 是 | 登陆账号 |
| LoginPassword | String | 是 | 登录密码 |
| LoginType | String | 是 | 登陆类型 [单位用户:ENTERPRISE/设备登录:USER] |
| language | String | 是 | 语言类型 [cn,中文;en,英文] |
| timeZone | Int | 是 | 时区[默认8] |
| apply | String | 是 | 应用类型[默认APP] |
| ISMD5 | Int | 否 | MD5验证[默认0不验证] |
| loginUrl | String | 否 | http://appzzl.18gps.net/ |

**Developer notes (original, Chinese):**

1.【备注】这是大家接触到本文档的第一个接口，后面的所有接口都是类似的结构，不清晰的地方及时反馈给项目发起人。  
2.【用途】就是获取令牌的值，即mds（mds可以理解为登录者身份的象征）如果在使用其他接口返回errorCode=403时，表示mds过期了，需要重新调登录接口获取一个新的mds。  
2.【请求】必填就是必须要给值，不给就报错，默认值也是可以的；如果出现否，则可填可不填，视具体情景而定。  
3.【回复】返回数据在很大程度上是标准的json对象字符串，但不绝对，注意看示例，以返回结果为准。最常见的是总有人把返回的id错误的当做设备id去获取最新位置，其实这里登录类型是"ENTERPRISE"时，返回的id是单位id，若登录类型为USER，才是设备id，请注意。

**Response examples:**

```
成功：
{
    "id": "5aa9e28a-80e3-4e29-b2b1-02774724d0",  //登录者的id（根据登录类型来定，此处是单位id）
    "success": "true",                          //是否登录成功
    "mds": "令牌用户身份标识",                //令牌
    "LoginType": "ENTERPRISE",               //登录类型：单位用户登录
    "grade": 4,                                //账户级别
    "msg": "登录成功",                         //错误描述
    "errorCode": 200                           //错误码
}
失败：
{
    "id": "00000000-0000-0000-0000-000000000000",
    "success": "false",
    "mds": null,
    "LoginType": "ENTERPRISE",
    "grade": -2000,
    "msg": "用户名或密码错误",
    "errorCode": 404
}
```

### Register an account (with device)
*Original heading: 2.账户注册（含设备）*

- **Endpoint:** `RegisterUser`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=RegisterUser&macid=xy1610100063&loginName=<PHONE>&password=123456&repassword=123456
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| macid | String | 是 | 设备号（IMEI） |
| loginName | String | 是 | 用户名 |
| password | String | 是 | 密码 |
| repassword | String | 是 | 确认密码 |

**Developer notes (original, Chinese):**

在App或是微信端需要这样的注册，可使用此接口。

**Response examples:**

大致界面：

### Change account password
*Original heading: 3.账户修改密码*

- **Endpoint:** `modifyEnterprisePwd`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=modifyEnterprisePwd&reg_pass=1234&reg_olbpass=123456&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| reg_pass | String | 是 | 新密码 |
| reg_olbpass | String | 是 | 旧密码 |
| ISMD5 | Int | 否 | 0不验证/1验证 |

**Developer notes (original, Chinese):**

无论是否启用MD5验证,新密码reg_pass必须是明文。  
MD5验证必须传大写的值（密码加密后的密文要求大写）。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "修改成功"
}
失败：
{
	"success": "false",
	"errorCode": "500",
	"errorDescribe": "描述"
}
```

### Bind a device to an account
*Original heading: 4.账户（绑定）设备*

- **Endpoint:** `ActiveAndAddDevice`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=ActiveAndAddDevice&login_id=3dfca26777e549338a72e03e1c354d65&mds=<MDS>&FullName=H25685&Macid=011610300002
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| login_id | Guid | 是 | 单位id |
| Macid | String | 是 | 设备号（IMEI） |
| Platenumber | String | 否 | 车牌号 |
| FullName | String | 否 | 设备名称（昵称） |

**Developer notes (original, Chinese):**

给账户添加设备，参数login_id的值取自登录时返回数据里的id字段。  
目的：  
下级客户或终端用户绑定设备。并非直接向平台添加一台全新的设备。  
  
过程：  
A账户里加了10000台设备。  
A账户的所有下级都可以通过设备号绑到自己账户下使用。  
不是A账户下级就会提示1，权限不足。

**Response examples:**

```
成功：
{
    "success": "true",
    "errorCode": "200",
    "errorDescribe": "",
    "data": [{"user_id": "476f61b2c6c349f3a9fc3e727090cb7a"}]
}
失败：
{
    "success": "false",
    "errorCode": "9",//已被别人绑定
    "errorDescribe": "BoundedByOther",
    "data": []
}
```

### Unbind a device from an account
*Original heading: 5.账户（解绑）设备*

- **Endpoint:** `unbundlingDevice`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=unbundlingDevice&mds=<MDS>&macid=011610300002
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| login_id | Guid | 是 | 单位id |
| macid | String | 是 | 设备号（IMEI） |

**Developer notes (original, Chinese):**

功能与绑定接口相反，解除绑定不代表设备完全删除，而是回到了首次添加设备的账户里去，通过绑定接口还能找回来。

**Response examples:**

```
成功：
{
    "success": "true",
    "errorCode": "200",
    "errorDescribe": "",
    "data": []
}
```

### Get live alarms
*Original heading: 6.获取实时报警*

- **Endpoint:** `queryLocalAlarmInfoUtc`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?timestamp=1508228270718&method=queryLocalAlarmInfoUtc&callback=timeWarnOBJ.loadDataCallBack&school_id=754a5a28-8f24-47ff-908f-c363663db852&mds=<MDS>&max_time=1508103827687&type=custom
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| school_id | Guid | 是 | 单位id/设备id |
| type | String | 是 | 固定值“custom” |
| max_time | Long | 是 | 上次报警时间（Utc时间戳毫秒数，控制获取范围） |
| timestamp | Long | 否 | 随机数（用于刷新缓存） |
| callback | String | 否 | 回调方法名 |

**Developer notes (original, Chinese):**

school_id可以是两种登录类型的其中一个。  
单位登录能获取最大报警数量为150条，设备登录则是60条，数据来自缓存。  
如果想获取历史报警记录，请使用第20.获取报警详单。  
  
怎么实现实时获取？  
1.关键是max_time这个字段。  
2.第一次访问接口，为max_time赋一个默认的值，比如昨天中午12点，那么获取到的将是max_time（昨天中午12点）到现在之间的报警数据。  
3.如果有数据返回（total不等于0时），代表这段时间有报警，在组织数据的时候比较max_time和send_time，把最大的值赋值给max_time，让max_time一直是最后一条报警的时间。  
4.设置计时器，每间隔10秒轮询一次接口，只要返回数据不为空，max_time的值就变化，为空则不改变就能实现实时。  
5.如果不需要用jsonp做回调，去掉callback，返回的将是json对象。

**Response examples:**

```
成功：
timeWarnOBJ.loadDataCallBack(
{
    "total": 1,
    "rows": [
        {
            "id": "1c20ee64-8eff-43aa-b77c-2a00c57cf3ce",// 报警编号（数据库主键）
            "macid": "864306200010433",// 设备编号
            "course": 0,// 方向
            "gps_status": "今天过期",// 描述
            "gps_time": 1508203827687,// 接受到报警数据的时间
            "jingdu": 113.853685,// 经度
            "weidu": 22.5890067,// 纬度
            "send_time": 1508203827687,// 报警时间
            "speed": "0",// 速度
            "status": 0,// 是否处理，0代表未处理
            "type_id": 61,// 报警类型
            "classifyDescribe": 0,// 二级分类描述，起补充作用
            "user_id": "75b9aca9-108a-43d5-90da-60095e6c6006",// 设备ID（Guid）
            "user_name": "GT03Y0010433",// 设备名称
            "macname": "GT03Y"// 设备型号
        }
    ],
    "success": true
})
```

### Get location history (track playback)
*Original heading: 7.获取历史轨迹*

- **Endpoint:** `getHistoryMByMUtcNew/getHistoryMByMUtc/`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=getHistoryMByMUtcNew&mds=<MDS>&playLBS=true&macid=9180144748&mapType=BAIDU&from=1521129600000&to=1521215940000

http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=getHistoryMByMUtc&mds=<MDS>&playLBS=true&userID=5d6fe45c-55cc-4345-a60a-46721eaf0b08&mapType=BAIDU&from=1521129600000&to=1521215940000
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| macid | String | 是 | 设备号（IMEI） |
| mapType | String | 是 | 地图类型(BAIDU) |
| from | Long | 是 | Utc时间戳毫秒数(开始时间) |
| to | Long | 是 | Utc时间戳毫秒数(结束时间) |
| playLBS | Bool | 否 | 是否获取基站轨迹点 |

**Developer notes (original, Chinese):**

1.from和to值的前端取法如下图，各类编程环境均有转换方法，搜百度。  
  
2.返回的Point字段为字符串类型。  
3.只能获取1000条数据，如果返回少于1000条，则已经取完了，若等于1000条则代表还有轨迹未取完。  
4.未取完，把第一次获取1000条数据的最大时间当成第二次获取的开始时间继续调用此接口，直到获取的条数小于1000条为止。

**Response examples:**

```
成功：
"113.0820431,33.8673257,1513126704000,10.9,37,bool#1|0|1||0|1|1$value#253781.84|0|||||||0|0||||||GPS|,0;113.0821168,33.8673128,1513126720000,0.2,0,bool#1|0|1||0|1|1$value#253781.84|0|||||||0|0||||||GPS|,0;113.0821572,33.8672707,1513126729000,11.4,131,bool#1|0|1||0|1|1$value#253781.85|0|||||||0|0||||||GPS|,0"
详细描述：

失败：
""
研发备注：
有人问到怎么解析里面数据的问题？
先用";"这个符号分隔所有数据得到总的数据条数，是一个数组A
循环这个数组，得到A[i];
假设a=A[i]="108.380335, 22.761847, 1557959518000, 38.89, 45, bool#1|0|1||0|1|1$value#10473.23||||100|||||||||||GPS|, 0";
用bool# 分隔单条，分隔后取第1位，继续 | 分隔，得到bool值数组
接着用value# 分隔单条，分隔后取第1位，继续|分隔得到value值数组
注意啊，第四和第五要分开写，切记！！！

附个图吧
```

### Get device list
*Original heading: 8.获取设备列表*

- **Endpoint:** `getDeviceList`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=getDeviceList&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| id | Guid | 否 | 下级单位ID【备用】 |

**Developer notes (original, Chinese):**

取直属自己账号的设备信息。(不包含下级)

**Response examples:**

```
成功：offline 0离线  1在线静止 2在线行驶
```

### Get latest position (one device)
*Original heading: 9.获取最新位置（单个设备）*

- **Endpoint:** `getUserAndGpsInfoByIDsUtc`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?mapType=BAIDU&mds=<MDS>&method=getUserAndGpsInfoByIDsUtcNew
&option=cn&user_id=c0095ae6-db7d-4932-8cb5-5b1531ed3637

接口名称：getUserAndGpsInfoByIDsUtcNew
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| mapType | String | 是 | 地图类型“BAIDU” |
| option | String | 是 | 语言“cn” |
| user_id | Guid | 是 | 设备id |

**Developer notes (original, Chinese):**

是否在线怎么判断？  
对比信号时间（序号7）和服务器时间（序号15），相差25分钟则离线，小于25分钟则为在线，速度为0则静止，不为0则行驶。  
  
怎么计算静止了多久或离线了多久？  
静止时间=server_time（系统时间）-datetime（更新时间）  
离线时间=server_time（系统时间）-heart_time（设备心跳时间）  
注意：计算出来的都是毫秒数，除以1000就是秒，app开发和h5都有转换的代码，网上搜一下。  
  
未启用判断：速度等于-9 并且 离线时间(server_time - heart_time) > 25分钟  
已过期判断：server_time（系统时间）-expire_date（到期时间，序号17）

**Response examples:**

```
成功：
key里面的数据属于解释性的，records数组里面的每条数组的每个值才是你真正有用的，比如status对应"状态【如下status】"， 一般这样使用：records[0][ status]。另外records数组为空表示此账户没有设备。
{
    "success": "true",
    "errorCode": "200",
    "errorDescribe": "",
    "data": [

        {
            "key": {            //该key为下面records组的详细备注
                "sys_time": 0,   //设备定位时间
                "user_name": 1,  //设备名称
                "jingdu": 2,	   //经度（gps定位）
                "weidu": 3,	   //纬度（gps定位）
                "ljingdu": 4,	   //基站经度（基站或wifi定位 使用此处经纬度）
                "lweidu": 5,	   //基站纬度（基站或wifi定位 使用此处经纬度）
                "datetime": 6,	   //数据更新时间（服务器接收时间）          
                "heart_time": 7,   //设备心跳时间（信号时间）
                "su": 8,	        //速度
                "status": 9,	   //状态组【如下表status】
                "hangxiang": 10,  //方向
                "sim_id": 11,	    //设备编号
                "user_id": 12,	    //设备id
                "sale_type": 13,	//销售类型-无用途
                "iconType": 14,	//图标
                "server_time": 15,	//系统时间（当前时间）
                "product_type": 16,	//设备类型
                "expire_date": 17,	//到期时间
                "group_id": 18,	//监控组ID
                "statenumber": 19,	//信息组【如下表status】
                "electric": 20,
                "describe": 21,		//设备描述信息（通常存放一些设备上传的运行参数）
                "sim": 22,		//sim卡
                "precision": 23     //精度误差（Lbs/WiFi）当值为10表示gps定位，无精度【无效】
isFollow":24,"是否是关注设备
plateNumber":25,"车牌号
auth":26,"权限
authList":27,"权限列表
deptname":28”单位名称
（202211/11添加）
                实际取值，这里多一位，是否关注，是否授权，无用途
            },
            "records": [
                [
                    1505987223000, //设备定位时间（utc时间戳）
                    "设备名称",
                    113.8272056,
                    22.6993799,
                    113.8272056,
                    22.6993799,
                    1505987173965,
                    1506325381478,
                    "0",
                    "1010000",
                    0,
                    "设备编号",
                    "a12e71f7a9b248df91fcbc65cbd9649",
                    1,
                    "01",
                    1506399055758,
                    "T3",
                    1516233600000,
                    "0",
                    "2435.99,0,0,,0,0,0,0,0,0,0,0,0,0,0,0",
                    0,
                    "",
                    "",
                    10
                ]
            ],
            "groups": []
        }
    ]
}
status(说明)：八个连续的字符组成
---第一位：acc状态（accState 1开0关），
---第二位：设备自身设防状态（ProtectState 1设防0撤防），
---第三位：油电（oilState 1开0关），
---第四位：充电状态（），
---第五位：门状态（1开0关）,
---第六位：定位状态（1定位0未定位）【无意义】
---第七位：主电状态（ElecState）
---第八位：平台设防状态（defend）【无意义】
---第九位：平台隐身状态（gpsOnOff）（1为隐身）
Statenumber(说明)：十六个连续的逗号分割字符组成
---第一位: 里程（mil），
---第二位: 油量（oil），
---第三位：重量（weight），
---第四位：温度1（tempc），
---第五位：备用电池电量（betteryV），电量的表示形式有两种：1是百分比  2是V （伏特）   获取电量大于100时，-100去V单位，小于100按百分比
---第六位：主电源电压（powerV），单位：V
---第七位：GPS颗数（gpscount），
---第八位: gsm信号强度（gsmlevel）,
---第九位: 正反转（ClockwiseState）,
---第十位: 车载状态(VehicleState),
---第十一位：龙锁数(lockcnt) ,
---第十二位：温度2（temp1),
---第十三位：温度3（temp2）,
---第十四位：温度4（temp3）
---第十五位：高度  (height)
---第十六位：定位信号类型（SignalType） 0：北斗GPS  1：Wifi定位  16：基站定位
---第十七位：步数（StepNumber）
---第十八位：车架号

研发补充：
{"key":{"sys_time":0,"user_name":1,"jingdu":2,"weidu":3,"ljingdu":4,"lweidu":5,"datetime":6,"heart_time":7,"su":8,"status":9,"hangxiang":10,"sim_id":11,"user_id":12,"sale_type":13,"iconType":14,"server_time":15,"product_type":16,"expire_date":17,"group_id":18,"statenumber":19,"electric":20,"describe":21,"sim":22,"precision":23,"isFollow":24},"records":[[1557712988,"59号",121.527837,31.100259,121.527837,31.100259,1557712988000,1557713134721,"0","10000010",124.0,"8629640236329","fdd70e9ebc6c4559aca661e49e",0,"22",1557713139056,"GS05B",2204150400000,"0","4.59,0,0,,6,0,12,4,0,0,0,0,0,0,0,0,",6.0,"ICCID:89860412101","",10,"0"]],"groups":[]}

蓝色部分是有用的，其他都是注释
[  //和上面的注释对应起来
1557712988, 
"59号", 
121.527837, 
31.100259, 
121.527837, 
31.100259, 
1557712988000, 
1557713134721, 
"0", 
"10000010", 
124.0, 
"8629640236329", 
"fdd70e9ebc6c4559aca661e49e", 
0, 
"22", 
1557713139056, 
"GS05B", 
2204150400000, 
"0", 
"4.59,0,0,,6,0,12,4,0,0,0,0,0,0,0,0,", 
6.0, 
"ICCID:89860412101", 
"", 
10, //当值为10表示gps定位，无（基站/wifi）精度；
"0" //是否关注【无用途】
]

注意有个逻辑：先判断是否到期了，再判断是否定位了，再判断是那种定位方式，最后再组织相应的展示效果。
```

### Edit device details (name, plate)
*Original heading: 10.修改设备资料*

- **Endpoint:** `SetGpsUserFullNameAndPlateNumber`
- **Method:** HTTP  GET
- **Example request:**

```
url/DataService.ashx/GetDate?method=SetGpsUserFullNameAndPlateNumber&macid=设备编号&fullName=设备名称&plateNumber=车牌号&mds=(登录接口获取)
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| macid | String | 是 | 设备号（IMEI） |
| fullName | String | 是 | 设备名称 |
| plateNumber | String | 是 | 车牌号 |
| LinkName | String | 否 | 联系人 |
| LinkTel | String | 否 | 联系号码 |
| sim | String | 否 | 设备sim卡号 |

**Developer notes (original, Chinese):**

注意最后三个不是必填的内容，有需要的可以填写进行修改。

**Response examples:**

```
成功：
{
	"data": [],
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "修改成功"
}
```

### Log out
*Original heading: 11.退出登录*

- **Endpoint:** `LoginOut`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=LoginOut&mds=(登录接口获取)
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |

**Developer notes (original, Chinese):**

作用：  
清除mds缓存，保证信息安全；  
清除app推送的pushId（含推送功能时）。

**Response examples:**

```
成功：
{
	"data": [],
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "修改成功"
}
```

### Send a command to a device
*Original heading: 12.下发指令*

- **Endpoint:** `SendCommands`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=SendCommands&macid=00005581D8F3&cmd=GETVERSION&param=&pwd=&sendTime=&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| macid | String | 是 | 设备号（IMEI） |
| mds | String | 是 | 令牌 |
| cmd | String | 是 | 指令名称 |
| param | String | 否 | 下发参数,用英文逗号分隔 |
| pwd | String | 否 | 设备密码 |
| sendTime | DateTime | 否 | 设置发送时间 |

**Developer notes (original, Chinese):**

```
下发指令成功后,返回“CmdNo”指令回执编号。
var backMess = { flowID: '流水号', SEND_SUCCESS: '操作成功', SEND_FAIL: '操作失败失败', PWD_ERROR: '密码错误', NOT_CUSTOMER: '客户不存在', USER_LEAVE: '当前设备离线,已安排上线后执行。', 'Not Online': '当前设备离线,已安排上线后执行。', 'PERMISSIONS': '体验账户，不能发送命令', Nonsupport: '指令不支持，请联系加入支持', SEND_OK: '指令下发成功', Fail: '指令下发失败', DeviceNot: '设备不存在', Cmd_ExceedLength: '警告：队列已满,请前往【指令-下发记录】页面查看！' };

设防cmd：SAFEON（一般情况，特殊指令可能不是此值）
撤防cmd：SAFEOFF（一般情况，特殊指令可能不是此值）
透传cmd：PASSTHROUGH （参数“0,5554”表示文本下发5554；“1,5554”表示16进制下发0x55 0x54）
```

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"CmdNo": "e2b6b72c-27a3-4b86-9da0-477aa43a3518",//回执编号
		"ReturnMsg": "USER_LEAVE"
	}]
}
```

### Query a command's result
*Original heading: 13.下发指令结果查询*

- **Endpoint:** `GetCommandResults`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=GetCommandResults&macid=00005581D8F3&cmdNo=e2b6b72c-27a3-4b86-9da0-477aa43a3518&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| macid | String | 是 | 设备号（IMEI） |
| mds | String | 是 | 令牌 |
| cmdNo | String | 是 | 回执编号 |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
------
```

### Request coordinates
*Original heading: 14.请求经纬度*

- **Endpoint:** `---`
- **Method:** HTTP  GET
- **Example request:**

```
http://poi.18gps.net/POI?lat=22.36&lon=114.256&map=BAIDU
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| lat | Double | 是 | 纬度 |
| lon | Double | 是 | 经度 |
| map | String | 是 | 地图类型 |

**Developer notes (original, Chinese):**

地图类型见前言。

**Response examples:**

```
成功：
香港特別行政區西貢區蠔涌村七巷26B2层.在六壬一炁善壇(西北)197米
```

### Get latest positions (batch)
*Original heading: 15.批量获取最新位置*

- **Endpoint:** `getDeviceListByCustomId`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=getDeviceListByCustomId&mds=<MDS>&id=e9c939f1-9c06-4312-b295-47f0162b4176&mapType=BAIDU
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| id | Guid | 是 | 单位ID |
| mds | String | 是 | 令牌 |
| mapType | String | 是 | 地图类型 |

**Developer notes (original, Chinese):**

返回数据 备注和获取最新位置（单个设备）一致。  
地图类型填空获取WGS84坐标经纬度

**Response examples:**

```
成功：{"success":"true","errorCode":"200","errorDescribe":"","data":[{"key":{"sys_time":0,"user_name":1,"jingdu":2,"weidu":3,"ljingdu":4,"lweidu":5,"datetime":6,"heart_time":7,"su":8,"status":9,"hangxiang":10,"sim_id":11,"user_id":12,"sale_type":13,"iconType":14,"server_time":15,"product_type":16,"expire_date":17,"group_id":18,"statenumber":19,"electric":20,"describe":21,"sim":22,"precision":23,"isFollow":24},"records":[[1444202949000,"天翼卡",114.046648,22.652224,114.046648,22.652224,1444202951657,1444202951657,"5","00000100",319.0,"383715011929452","1fe02b6045a4477aae90e66a7c2218de",0,"24",1547696829997,"GT003",2565648000000,"0","0.42,0,0,,0,6,0,86,0,0,0,0,0,0,0,0",0.0,"","",10,"0"],[1538011845000,"SC2082204818",116.158823,34.279542,116.158823,34.279542,1538012061443,1538012061443,"57.7","10100110",22.0,"993182204818","8d54f75b3469471face04d88f57cda03",0,"01",1547696829997,"SC20",1553529600000,"0","0,0,0,,0,14.39,11,22,0,1,0,0,0,0,0,0",0.0,"","",10,"0"]],"groups":[],"followCount":0,"deviceCount":23}]}
```

### Get device list of a sub-account
*Original heading: 16.获取下级单位设备列表*

- **Endpoint:** `getDeviceListByCustomId`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=getDeviceListByCustomId&mds=<MDS>&id=334f2e92-787d-45e8-bf5c-3b500a8c787d
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| id | Guid | 是 | 下级单位ID |
| mapType | String | 否 | 地图类型（默认百度 "BAIDU"） |

**Developer notes (original, Chinese):**

取下级单位的设备列表。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"key": {       //详见最新位置单个（第二节，第9个接口）
			"sys_time": 0,
			"user_name": 1,
			"jingdu": 2,
			"weidu": 3,
			"ljingdu": 4,
			"lweidu": 5,
			"datetime": 6,
			"heart_time": 7,
			"su": 8,
			"status": 9,
			"hangxiang": 10,
			"sim_id": 11,
			"user_id": 12,
			"sale_type": 13,
			"iconType": 14,
			"server_time": 15,
			"product_type": 16,
			"expire_date": 17,
			"group_id": 18,
			"statenumber": 19,
			"electric": 20,
			"describe": 21,
			"sim": 22,
			"precision": 23,
			"isFollow": 24
		},
		"records": [
			[1482596907000, "601603080377", 114.231935, 22.667007, 114.231935, 22.667007, 1482591004402, 1482596908894, "0", "00000100", 134.0, "601603080377", "2f45ed3a309744c5b9da11cc5bd3d5dd", 0, "22", 1551926835558, "DXMKT", 2141959763770, "1830a1e7cf8a4790b10e3bab2e7c2406", "813312.57,0,0,,0,0,5,26,0,0,0,0,0,0,0,0,", 0.0, "", "1234458373", 10, "0"],
			[1511853204362, "902B75072918", 114.223921, 22.665438, 114.223921, 22.665438, 1511853204362, 1511853767987, "0", "00000000", 0.0, "391517075072918", "6a33f9dc7418430ba5388dba4cdc9f33", 0, "22", 1551926835558, "902B", 1544515200000, "0", "0,0,0,,6,0,0,100,0,0,0,0,0,0,0,16,", 6.0, "", "", 550, "0"],
			[0, "DXMKT7908511", 0.0, 0.0, 0.0, 0.0, 0, 0, "-9", "00000000", 0.0, "867273027908511", "559d5b39f46c4790b729d2a86f5bef31", 0, "01", 1551926835558, "DXMKT", 1542240000000, "0", "0,0,0,,0,0,0,0,0,0,0,0,0,0,0,0,", 0.0, "", "", 10, "0"]
		],
		"groups": [],
		"followCount": 0,  //关注个数
		"deviceCount": 3   //设备个数
	}]
}
```

### Bind device (backup / move device)
*Original heading: 17.绑定设备接口【备用】*

- **Endpoint:** `MoveDevice`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=MoveDevice&mds=<MDS>&id=334f2e92-787d-45e8-bf5c-3b500a8c787d&macid=027028656666
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| id | Guid | 是 | 单位ID（写自己的） |
| macid | String | 是 | 设备号 |

**Developer notes (original, Chinese):**

已经注册了账户，需要重新添加另一台设备到自己账户下时。

**Response examples:**

```
成功：
```

### Set alarm filter
*Original heading: 18.设置报警过滤【设备登录和账户登陆通用】*

- **Endpoint:** `setFilterAlarmInfo`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDataService.aspx?method=setFilterAlarmInfo&custid=754a5a28-8f24-47ff-908f-c363663db702&mds=<MDS>&alarmType=,0,3,7,
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| custid | Guid | 是 | 单位ID（登录ID） |
| alarmType | String | 是 | 过滤的报警类型，逗号分隔 |

**Developer notes (original, Chinese):**

默认勾选是需要报警的项，不想报此类型的报警需取消勾选。

**Response examples:**

```
成功：
{
    success: "true", 
    msg: 1, 
    filterObj: ",0,3,7,"} //过滤的报警类型
```

### Get filtered alarm codes
*Original heading: 19.获取过滤报警编号*

- **Endpoint:** `GetPushAlarmSwitch`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDataService.aspx?method=GetPushAlarmSwitch&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |

**Developer notes (original, Chinese):**

查询设置了过滤的报警类型编号。

**Response examples:**

```
成功：
{
    success: "true", 
    errorCode: "200", 
    errorDescribe: "", 
    data: [
        [
            0, 
            3, 
            7
        ]
    ]}
```

### Get alarm details
*Original heading: 20.获取报警详单*

- **Endpoint:** `alarmOperation`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDataService.aspx?method=alarmOperation&mds=<MDS>&alarmType=1,2,3,4,6,7,8,9,10,11,14,38&enterprise_id=e0329898-4eaa-4612-9f69-00986998d89b&userid=72b92fe0-34ca-483b-b0f9-27e4c7ee3d92&beginTime=1587916800000&endTime=1587951883000
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| alarmType | String | 是 | 报警类型 |
| enterprise_id | Guid | 是 | 单位ID（登录ID） |
| userid | Guid | 是 | 设备ID |
| beginTime | Long | 是 | Utc时间戳毫秒数(开始时间) |
| endTime | Long | 是 | Utc时间戳毫秒数(结束时间) |

**Developer notes (original, Chinese):**

返回结果备注见第6个接口。

**Response examples:**

```
成功：{
    success: "true", 
    errorCode: "200", 
    errorDescribe: "", 
    data: [    
        {
            id: "efe0fb98-7e86-4a94-bdab-642ae07898cc", 
            fullname: "皖A （压车）", 
            classify: 38, 
            lon: 117.203048, 
            lat: 31.926648, 
            addtime: "2020/04/27 08:31:57", 
            ptime: "2020/04/27 08:31:44", 
            status: 0, 
            speed: 0, 
            macid: "09103****855", 
            userid: "72b92fe0-34ca-483b-b0f9-27e4c7ee3992", 
            macname: "JT808", 
            NumberId: 3, 
            Notea: ""
        }
    ]}
```

### Change device password
*Original heading: 21.设备修改密码*

- **Endpoint:** `modifyUserPwd`
- **Method:** HTTP  GET
- **Example request:**

```

```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| macid | String | 是 | 设备号 |
| pwd | Guid | 是 | 新密码 |
| oldPwd | Guid | 是 | 旧密码 |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：{
    success: "true", 
    errorCode: "200", 
    errorDescribe: "", 
data: []
}
```

### Command history
*Original heading: 22.发送指令历史记录*

- **Endpoint:** `GetSendCmdList`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDataService.aspx?method=GetSendCmdList&mds=<MDS>&macid=027045307931&count=&_t=1614219663391
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| macid | String | 是 | 设备号 |
| count | int | 否 | 条数 |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"Describe": "GETVERSION",//指令字（指令类型）需字典转换
		"Param": "",//指令内容
		"IsOK": "Null",//状态
		"Msg": "",//响应信息
		"SendTime": 1614219644177,//发送时间
		"AddTime": 1614219644192,//添加时间
		"ExtData": {
			"source": "web:web"//来源
		}
	}]
}
```

### Clear queued commands
*Original heading: 23.清空指令*

- **Endpoint:** `ClearCmdList`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDataService.aspx?method=ClearCmdList&mds=<MDS>&macid=027045307931
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| macid | String | 是 | 设备号 |

**Developer notes (original, Chinese):**

一键清除所有指令记录，包含两个方面：  
1.清除发送历史（指令成功的清理掉）  
2.清除正在排队的指令（指令未成功或排队的，取消发送）。

**Response examples:**

```
成功：{
    success: "true", 
    errorCode: "200", 
    errorDescribe: "", 
data: []
}
```

### Get stop points
*Original heading: 24.获取停留点*

- **Endpoint:** `StayDetail`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net/GetDataService.aspx?method=StayDetail&mds=<MDS>&beginTime=1621227915000&endTime=1621231515000&userid=badda545-a4c7-459f-9600-b4729abaeee3&mapType=GAODE
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| beginTime | Long | 是 | Utc时间戳毫秒数(开始时间) |
| endTime | Long | 是 | Utc时间戳毫秒数(结束时间) |
| userid | Guid | 是 | 设备id |
| mapType | String | 是 | 地图类型 |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
[
    {
        "id": 1, //序号
        "fullName": "测试专用",//名称
        "beginDate": "2021/5/17 12:40:58",
        "endDate": "2021/5/17 13:58:40",
        "lon": 103.77622606,
        "lat": 35.98225666,
        "stopCar": "1Hour17Minute42second" //停留时间
    }
]
```


#### Voice and multimedia

### Get multimedia records (live)
*Original heading: 1.获取多媒体记录（实时）*

- **Endpoint:** `GetMultimediaRecords`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDataService.aspx?method=GetMultimediaRecords&mds=<MDS>&target=6020036221&userId=e0329898-4eaa-4612-9f69-00986998d89b&maxTime=0
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| target | String | 是 | 设备号 |
| userId | Guid | 是 | 登录ID（登录接口返回的ID） |
| maxTime | Long | 是 | 最大时间（Utc时间戳毫秒数） |

**Developer notes (original, Chinese):**

maxTime如果为0，获取的记录是距离现在时间最近的50条记录。  
maxTime如果是具体时间，那么获取的是此时间点到现在时间之间的所有记录。  
  
返回数据：  
Id消息编号  
UserId账户ID  
Target设备编号或用户ID或频道ID  
Content内容  
FileName文件名  
Url 文件地址  
InfoType消息类型[0:语音，1:视频，2:图片，3:文本]  
IsUser是否用户发送，0为设备上传  
Addtime添加时间

**Response examples:**

```
成功：{
    success: "true", 
    errorCode: "200", 
    errorDescribe: "", 
data: []
}
```

### Get voice history (paged)
*Original heading: 2.获取语音历史记录（分页）*

- **Endpoint:** `GetVoiceHistory`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDataService.aspx?method=GetVoiceHistory&mds=<MDS>&macid=6020036221&loingId=3975226d-d106-47c1-8cc5-17ebc42818bb&minTime=0&count=10
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| macid | String | 是 | 设备号 |
| loingId | Guid | 是 | 登录ID（登录接口返回的ID） |
| minTime | Guid | 是 | 最小时间（Utc时间戳毫秒数） |
| count | Int | 否 | 条数（默认20） |

**Developer notes (original, Chinese):**

取macid设备，minTime这个时间点之后，count条数据。  
  
返回数据：  
Id消息编号  
UserId账户ID  
Target设备编号或用户ID或频道ID  
Content内容  
FileName文件名  
Url 文件地址  
InfoType消息类型[0:语音，1:视频，2:图片，3:文本]  
IsUser是否用户发送，0为设备上传  
Addtime添加时间

**Response examples:**

```
成功：{
    success: "true", 
    errorCode: "200", 
    errorDescribe: "", 
data: []
}
```

### Delete voice recordings
*Original heading: 3.删除录音（支持多个）*

- **Endpoint:** `DeleteSingleVoice`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDataService.aspx?method=DeleteSingleVoice&mds=<MDS>&ids=c0095ae6-db7d-4932-8cb5-5b1531ed3637,c0095ae6-db7d-4932-8cb5-5b1531ed3638&loingId=3975226d-d106-47c1-8cc5-17ebc42818bb
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| ids | String | 是 | 消息编号，录音编号，Guid格式，多个时用“,”拼接 |
| loingId | Guid | 是 | 登录ID（登录接口返回的ID） |

**Developer notes (original, Chinese):**

还记得获取记录的数据格式吗，第一个Id字段（Guid格式）可以用来删除，批量删除时，用英文逗号分隔即可。

**Response examples:**

```
成功：{
    success: "true", 
    errorCode: "200", 
    errorDescribe: "", 
data: []
}
```


#### Circular geofences

### Add circular geofence
*Original heading: NO.1新增设备圆形围栏*

- **Endpoint (method name):** `CircularFenceSave`
- **Method:** HTTP GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=CircularFenceSave&mds=<MDS>&FenceName=测试1&MacId=062080801189&Status=1&Lat=22.57&Lng=112.57&Radius=500&MapType=BAIDU
```

**Parameters** (原: 参数=name, 类型=type, 必填=required 是=yes/否=no)

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| MacId | String | 是 | 设备号IMEI |
| MapType | String | 是 | 地图类型【见前言】 |
| FenceName | String | 是 | 围栏名称 |
| Status | Int | 是 | 围栏状态0.关闭/1.入界/2.出界/3.双向 |
| Lat | Double | 是 | 纬度 |
| Lng | Double | 是 | 经度 |
| Radius | Int | 是 | 半径 |
| Height | Int | 否 | 高度 |

**Description and response (original, Chinese comments kept):**

```
接口描述：
无。
返回 [JSON]：
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": []
}
失败：
{
}
```

### Edit circular geofence
*Original heading: NO.2修改设备圆形围栏*

- **Endpoint (method name):** `CircularFenceModify`
- **Method:** HTTP GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=CircularFenceModify&mds=<MDS>&FenceName=我3被修改了&MacId=865609163017108&Status=0&Lat=22.57&Lng=112.57&Radius=1200&MapType=BAIDU&Id=9bf3165f-616b-45f9-8c56-b5210145893c
```

**Parameters** (原: 参数=name, 类型=type, 必填=required 是=yes/否=no)

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| MapType | String | 是 | 地图类型【见前言】 |
| FenceName | String | 是 | 围栏名称 |
| Status | Int | 是 | 围栏状态0.关闭/1.入界/2.出界/3.双向 |
| Lat | Double | 是 | 纬度 |
| Lng | Double | 是 | 经度 |
| Radius | Int | 是 | 半径 |
| Height | Int | 否 | 高度 |
| Id | Guid | 是 | 围栏Id |

**Description and response (original, Chinese comments kept):**

```
接口描述：
无。
返回 [JSON]：
成功：
{
}
失败：
{
}
```

### Delete circular geofence
*Original heading: NO.3删除设备圆形围栏*

- **Endpoint (method name):** `CircularFenceDelete`
- **Method:** HTTP GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=CircularFenceDelete&mds=<MDS>&MacId=062080801189&Id=4147d849-dbb6-4fd2-833d-6d2f5ffa08a4
```

**Parameters** (原: 参数=name, 类型=type, 必填=required 是=yes/否=no)

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| MacId | String | 是 | 设备号IMEI |
| Id | Guid | 是 | 围栏Id |

**Description and response (original, Chinese comments kept):**

```
接口描述：
无。
返回 [JSON]：
成功：
{
}
失败：
{
}
```

### List circular geofences
*Original heading: NO.4获取圆形围栏列表【多个】*

- **Endpoint (method name):** `CircularFenceGetList`
- **Method:** HTTP GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=CircularFenceGetList&mds=<MDS>&MacId=062080801189&MapType=BAIDU
```

**Parameters** (原: 参数=name, 类型=type, 必填=required 是=yes/否=no)

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| MacId | String | 是 | 设备号IMEI |
| MapType | String | 是 | 地图类型【见前言】 |

**Description and response (original, Chinese comments kept):**

```
接口描述：
无。
返回 [JSON]：
成功：
  {
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"Id": "935bd0f5-c123-485b-b963-afd9f9ada48c",  //围栏id
		"UserId": "00000000-0000-0000-0000-000000000000", //暂无用途
		"MacId": "062080801189",  //设备号
		"FenceName": "测试2",      //围栏名称
		"Status": 1,//围栏状态0.关闭/1.入界报警/2.出界报警/3.双向
		"Lat": 22.566695,   //纬度
		"Lng": 112.558606,  //经度
		"Radius": 800,       //半径
		"Height": 0,         //高度（3维围栏，暂无用途）
		"MapType": null      //地图类型，null时，代表地图原始坐标
	}, {
		"Id": "0c0ae4ff-f662-4fb1-adfb-70c9be96231d",
		"UserId": "00000000-0000-0000-0000-000000000000",
		"MacId": "062080801189",
		"FenceName": "测试3",
		"Status": 1,
		"Lat": 22.566695,
		"Lng": 112.558606,
		"Radius": 1000,
		"Height": 0,
		"MapType": null
	}]
}
失败：
{
}
```


#### Sharing / authorisation

### Grant device access to another user
*Original heading: NO.5添加设备功能授权*

- **Endpoint:** `EmpowerAdd`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDateServices.asmx/GetDate?method=EmpowerAdd&Macid=868120167290847&Authorized=<PHONE>&mds=<MDS>&StartTime=1561685418156&EndTime=1561785418156&FunctionList=1,2
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 功能调用 |
| mds | String | 是 | 令牌 |
| Authorized | String | 是 | 被授权人 |
| Macid | String | 是 | 设备号 |
| StartTime | long | 是 | 开始时间（utc毫秒数） |
| EndTime | long | 是 | 结束时间（utc毫秒数） |
| FunctionList | String | 是 | 功能列表（不能为空） |

**Developer notes (original, Chinese):**

FunctionList详细说明  
1位置    
2开关锁/寻车   
3启动熄火   
4轨迹  
  
不能对自己授权  
授权他人后，他人不得二次授权  
错误码1007不能对自己操作，错误码50019权限不足。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": []
}
```

### Revoke device access
*Original heading: NO.6取消设备功能授权*

- **Endpoint:** `EmpowerDelete`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDateServices.asmx/GetDate?method=EmpowerDelete&EmpowerId=6615f5270d7f44fb9318e18257b8c304&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 功能调用 |
| mds | String | 是 | 令牌 |
| EmpowerId | Guid | 是 | 授权ID |

**Developer notes (original, Chinese):**

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": []
}
```

### List grants (owner view)
*Original heading: NO.7获取授权列表【主人身份】*

- **Endpoint:** `EmpowerGetList`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDateServices.asmx/GetDate?method=EmpowerGetList&type=0&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 功能调用 |
| mds | String | 是 | 令牌 |
| type | String | 否 | 类型（0默认获取有效授权，1则获取包含过期的授权） |

**Developer notes (original, Chinese):**

获取我本人授权的信息，后面又新增了：  
授权人手机号/账号  //CustName  
被授权人手机号/账号//AuthorizedName  
车辆名称           //VehicleName  
车牌号             //PlateNumber

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"EmpowerId": "6615f5270d7f44fb9318e18257b8c304",  //授权id
		"CustId": "e9c939f19c064312b29547f0162b4176",    //授权人id
		"Authorized": "ff1fffe199fd49ea8f31bcc47cbe3f4f",   //被授权人id
		"Macid": "868120167290847",                     //设备号
		"EquipmentId": "bf06541f33874c00903c15ec2879a4d0",//设备id
		"IsExpire": 0,                                 //是否过期0否 1是
		"StartTime": 1561685418156,                    //开始时间
		"EndTime": 1561785418156,                     //结束时间
		"FunctionList": [1, 2],                           //功能列表
		"AddTime": 1561686728650                      //授权时间
	}]
}
```

### List grants received (guest view)
*Original heading: NO.8获取被授权人列表【客人身份】*

- **Endpoint:** `EmpowerGetAuthorizedList`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDateServices.asmx/GetDate?method=EmpowerGetAuthorizedList&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 功能调用 |
| mds | String | 是 | 令牌 |

**Developer notes (original, Chinese):**

以客人身份，获取被授权的设备信息和权限。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"EmpowerId": "1a3d61b377324578ab671568da6c1736",
		"CustId": "e9c939f19c064312b29547f0162b4176",
		"Authorized": "ff1fffe199fd49ea8f31bcc47cbe3f4f",
		"Macid": "868120167290847",
		"EquipmentId": "bf06541f33874c00903c15ec2879a4d0",
		"IsExpire": 0,
		"StartTime": 1561685418156,
		"EndTime": 1561785418156,
		"FunctionList": [1, 2],
		"AddTime": 1561687437463
	}]
}
```


#### OBD box

OBD是英文On-Board Diagnostics的缩写，中文翻译为“车载诊断系统”，

长的就是下图这种样子，安装位置在驾驶席刹车左上方如第二张图，这种设备以上次故障码，车况数据，行程数据而驰名。

> **English:** OBD (On-Board Diagnostics) boxes plug into the vehicle's diagnostic port and are known for fault codes, vehicle-condition data and trip data. Only relevant for vehicle trackers.

### OBD: fault codes
*Original heading: NO.1获取故障码数据【2018】*

- **Endpoint:** `getCurCodeV3`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDateServices.asmx/GetDate?method=getCurCodeV3&macid=601602230004&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 功能调用 |
| mds | String | 是 | 令牌 |
| macid | String | 是 | 设备号 |

**Developer notes (original, Chinese):**

data为空数组“[]”时，表示没有检测到故障码。

**Response examples:**

```
成功：
{
    "success": "true",
    "errorCode": "200",
    "errorDescribe": "",
    "err": "",
    "info": "",
    "data": [
        {
            "sysId": "2",                              //无意义
            "obdcode": "P0205",                       //故障码名称
            "obdcodestr": "P0205",                     //故障码名称
            "obddescription": "喷油器电路/开路-第5缸",  //故障码翻译
            "obddescription_en": ""
        },
        {
            "sysId": "0",
            "obdcode": "P0308",
            "obdcodestr": "P0308",
            "obddescription": "第8缸检测到失火",
            "obddescription_en": ""
        }
    ],
    "obdSys": [
        {
            "sysId": "0",          //无意义
            "obdTitle": "点火系统", //属于哪个系统（底部有16个系统标题）
            "obdCount": 1         //本系统有多少个故障码
        },
        {
            "sysId": "1",
            "obdTitle": "车身电脑控制系统",
            "obdCount": 0
        },
        {
            "sysId": "2",
            "obdTitle": "燃油和空气侦测系统",
            "obdCount": 1
        },
        {
            "sysId": "3",
            "obdTitle": "废气控制系统",
            "obdCount": 0
        },
        {
            "sysId": "4",
            "obdTitle": "变速箱控制系统",
            "obdCount": 0
        },
        {
            "sysId": "5",
            "obdTitle": "燃油和空气侦测系统",
            "obdCount": 0
        },
        {
            "sysId": "6",
            "obdTitle": "车速怠速控制系统",
            "obdCount": 0
        },
        {
            "sysId": "7",
            "obdTitle": "电脑控制系统",
            "obdCount": 0
        },
        {
            "sysId": "8",
            "obdTitle": "网路系统",
            "obdCount": 0
        },
        {
            "sysId": "9",
            "obdTitle": "底盘电脑控制系统",
            "obdCount": 0
        },
        {
            "sysId": "10",
            "obdTitle": "其它系统",
            "obdCount": 0
        }
    ],
    "fraction": 80
}

故障码系统分为16类：
车身系统
底盘系统
燃油空气或排放控制
燃油或空气
点火系统
排放控制
车速及怠速控制
计算机或辅助输出电路
变速箱
混合动力系统
动力总成系统
辅助输入
计算机或辅助输出
气缸停缸
网络通讯系统
其它系统
```

### OBD: latest vehicle condition
*Original heading: NO.2获取最新车况数据【2018】*

- **Endpoint:** `OBDLatestCarCondition`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDateServices.asmx/GetDate?method=OBDLatestCarCondition&macid=601804250020&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 功能调用 |
| mds | String | 是 | 令牌 |
| macid | String | 是 | 设备号 |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"Number": "P_01",
		"Key": "车速",
		"Value": "0 km/h"
	}, {
		"Number": "P_02",
		"Key": "发动机转速",
		"Value": "601 rpm"
	}, {
		"Number": "P_03",
		"Key": "发动机冷却液温度",
		"Value": "74 ℃"
	}, {
		"Number": "P_10",
		"Key": "发动机负荷计算值",
		"Value": "16 %"
	}, {
		"Number": "P_13",
		"Key": "瞬时油耗",
		"Value": "100 L/100km"
	}, {
		"Number": "P_18",
		"Key": "控制模块电压",
		"Value": "27 V"
	}, {
		"Number": "P_19",
		"Key": "油门踏板绝对位置D",
		"Value": "0 %"
	}, {
		"Number": "P_21",
		"Key": "刹车状态",
		"Value": "刹车不动作"
	}, {
		"Number": "P_23",
		"Key": "瞬时油耗",
		"Value": "2 L/h"
	}, {
		"Number": "P_26",
		"Key": "OBD模块状态",
		"Value": "行程中"
	}]
}
```

### OBD: last trip
*Original heading: NO.3获取最后一次行程【2018】（单次）*

- **Endpoint:** `getStrokeData`
- **Method:** HTTP  GET
- **Example request:**

```
http://api.18gps.net//GetDateServices.asmx/GetDate?method=getStrokeData&mds=<MDS>&user_id=20992b1f-315b-4920-b9a4-d3509f33a3c2
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 功能调用 |
| mds | String | 是 | 令牌 |
| user_id | Guid | 是 | 设备id |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
{
	"id": "bd1382e2-af21-44b6-ba00-c2c62e49c3f3",
	"btime": 1533254331000,
	"etime": 1533263282000,
	"distance": 46.42,
	"maxspeed": 62.0,
	"totalSpeedoverSeconds": null,
	"brakeTimes": 0,
	"emergencyBrakeTimes": 0,
	"speedupTimes": 0,
	"emergencySpeedupTimes": 0,
	"speed": 18,
	"maxTempc": 0.0,
	"maxEngRPM": 1977,
	"powerv": 0.0,
	"totalfuelUsed": 18.737,
	"fuelHKM": 0.0,
	"overtimeDriverMinutes": 0,
	"extend": [{
		"Number": "T_01",
		"Key": "行驶时间",
		"Value": "4934 s"
	}, {
		"Number": "T_03",
		"Key": "行程时间",
		"Value": "8951 s"
	}, {
		"Number": "T_08",
		"Key": "ECU总里程",
		"Value": "4463300 km"
	}, {
		"Number": "T_15",
		"Key": "平均转速",
		"Value": "88300 rpm"
	}, {
		"Number": "T_16",
		"Key": "平均油门",
		"Value": "1200 %"
	}, {
		"Number": "T_17",
		"Key": "平均负荷",
		"Value": "2500 %"
	}, {
		"Number": "T_21",
		"Key": "制动次数",
		"Value": "202 次"
	}]
}
```

### OBD: trips
*Original heading: NO.4获取行程*

- **Endpoint (method name):** `getStrokeV3/getStrokeV3_extend`
- **Method:** HTTP GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=getStrokeV3&macid=xy1610100063&beginTime=1517129108109&endTime=1517129208109
```

**Parameters** (原: 参数=name, 类型=type, 必填=required 是=yes/否=no)

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| macid | String | 是 | 设备号 |
| beginTime | Long | 是 | Utc时间戳(开始时间) |
| endTime | Long | 是 | Utc时间戳(结束时间) |

**Description and response (original, Chinese comments kept):**

```
接口描述：
返回 [JSON]：
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"rows": [{
			"totalfuelUsed": "0.5",  //行驶总油耗
			"distance": "3.3",      //行驶距离
			"fuelHKM": "15.2",//百公里油耗
			"totalSpeedoverSeconds": null,//超速行驶时间
			"maxspeed": "61",//最大次数
			"brakeTimes": 0,//停留时间
			"emergencyBrakeTimes": 0,//急减速次数
			"speedupTimes": 0,//急加速时长
			"emergencySpeedupTimes": 0,//急加速次数
			"speed": "0",//平均车速
			"maxTempc": 86,//最高水温
			"btime": "7:21",//开始时间
			"etime": "7:34",//结束时间
			"strokeTime": "2018/12/13",//日期
			"jsType": 2,//
			"driveTime": 780.0,//行驶时间（秒）
			"fraction": 100.0,//
			"random": "95%",//
			"coulometric": 0,//
			"ExtendedData": {//扩展数据
				"SpeedLimitFuel": 0,
				"SpeedLimitMil": 0,
				"SpeedLimitTime": 0,
				"HighSpeedFuel": 0,
				"HighSpeedMil": 0,
				"HighSpeedTime": 0,
				"MediumSpeedFuel": 0,
				"MediumSpeedMil": 0,
				"MediumSpeedTime": 0,
				"LowSpeedFuel": 0,
				"LowSpeedMil": 0,
				"LowSpeedTime": 0,
				"IdleSpeedFuel": 0,
				"IdleSpeedTime": 0,
				"SharpTurnCount": 0,
				"SpeedLimitCount": 0,
				"FastTrackCount": 0
			},
			"BeginTime": 1544656903000,//utc
			"EndTime": 1544657683000//utc
		}],
		"avgFuel": "12.45",//本次查询平均油耗
		"totalfuel": "2.9",//本次查询总油耗
		"totalmil": "23.3",//本次查询总里程
		"totalDriveTime": "6198",//本次查询总行驶时间（秒）
		"totalCoulometric": "0",//。。
		"oilPrice": 0.0//。。
	}]
}
失败：
{
}
```

### OBD: trips (batch)
*Original heading: NO.5批量获取行程《支持单个》D平台支持*

- **Endpoint (method name):** `BatchGetTrips`
- **Method:** HTTP GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=BatchGetTrips&macids=xy1610100063,601603080472&beginTime=1519780593918&endTime=1519803593918&mds=<MDS>
```

**Parameters** (原: 参数=name, 类型=type, 必填=required 是=yes/否=no)

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| macids | String[] | 是 | 设备列表 |
| beginTime | Long | 是 | Utc时间戳(开始时间) |
| endTime | Long | 是 | Utc时间戳(结束时间) |

**Description and response (original, Chinese comments kept):**

```
接口描述：
返回 [JSON]：
{
	"totalfuelUsed": "0.3", //总油耗
	"distance": "3.0", //距离（km）
	"fuelHKM": "11.7", //百公里油耗
	"totalSpeedoverSeconds": null, //超速行驶时间
	"maxspeed": "50", //最大速度
	"brakeTimes": 0, //停留时间（单位：秒）
	"emergencyBrakeTimes": 1, //急减速次数
	"speedupTimes": 0, //急加速时间（单位：秒）
	"emergencySpeedupTimes": 0, //急加速次数
	"speed": "14", //平均速度
	"maxTempc": 68, //最高水温
	"maxEngRPM": 1500, //最高发动机转速
	"powerv": 14.2, //电压
	"overtimeDriverMinutes": 1500, //疲劳驾驶（秒）
	"btime": "10:49:25", //开始时间
	"etime": "11:02:23", //结束时间
	"strokeTime": "2018/2/28", //日期
	"jsType": 0,       //0：急先锋1：标准型2：稳重型3：慢羊羊
	"driveTime": 745.0, //行驶总秒数
	"fraction": 0.0,
	"random": null,
	"coulometric": 0
},
成功：
{
}
失败：
{
}
```


---

## Part 3: PC / admin API


### Note on Part 3

网页端适用于运营商自营平台，自己服务器搭建前端页面供给用户访问，不支持对18gps平台使用。

> **English:** "The web/PC-side interfaces are for operators who run their own platform: you build the front-end on your own server for your users. **They are not supported for use against the 18gps platform.**"

### Create sub-user (with permissions)
*Original heading: 1.新增用户（含权限）*

- **Endpoint:** `registerCustomer`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=registerCustomer&mds=<MDS>&name=上海科大&schoolID=754a5a28-8f24-47ff-908f-c363663ab225&loginName=skd&pwd=123456&repwd=123456&grade=2&contact=&phone=&addr=
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| schoolID | Guid | 是 | 父级单位id |
| name | String | 是 | 客户名称/单位名称 |
| loginName | String | 是 | 登录账号 |
| pwd | String | 是 | 密码 |
| repwd | String | 是 | 确认密码 |
| grade | Int | 是 | 客户类型 |
| contact | String | 否 | 联系人 |
| phone | String | 否 | 电话 |
| addr | String | 否 | 地址 |

**Developer notes (original, Chinese):**

此处一定注意一下grade这个客户类型这个参数，它的取值没有统一的标准，需要在服务器数据库查询，如需用到请向业务部咨询。

**Response examples:**

```
成功：
{
	"id": "cfd2722a-4db6-47ab-974e-d0b6d30a7ecd",//为新账户分配的guid
	"result": 1,   //0代表失败
	"success": true//true代表成功
}
```

### Delete user
*Original heading: 2.删除用户*

- **Endpoint:** `deleteEnterprise`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=deleteEnterprise&mds=<MDS>&id=cfd2722a-4db6-47ab-974e-d0b6d30a7ecd
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| id | Guid | 是 | 单位id |

**Developer notes (original, Chinese):**

以下2种情况无法删除，用户设备列表不为空，用户下级存在其他用户。

**Response examples:**

```
成功：
{
	"success": "true",
	"status": 1
}
失败：
{
	"success": "false",
	"errorCode": "500",
	"errorDescribe": "未将对象引用设置到对象的实例。",//找不到此用户
	"data": []
}
```

### List users (tree)
*Original heading: 2.获取用户列表*

- **Endpoint:** `GetCustomTreeById`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=GetCustomTreeById&mds=<MDS>&id=e9c939f1-9c06-4312-b295-47f0162b4176
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| id | Guid | 是 | 单位id |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"id": "3dfca267-77e5-4933-8a72-e03e1c354d65",//下级单位id
		"deptName": "千百次回眸不笑(2/2)",//客户名称/单位名称
		"deviceCount": 2,   //设备总数
		"userName": "baidu",//登录账号
		"pId": "e9c939f1-9c06-4312-b295-47f0162b4176", //父级id
		"isParent": 0 //是否是父级节点，0不是（代表没有下级了）
	}, {
		"id": "7ba648da-ad90-4a34-8788-822bcf666665",
		"deptName": "秋明山上(0/0)",
		"deviceCount": 0,
		"userName": "qiuqiu",
		"pId": "e9c939f1-9c06-4312-b295-47f0162b4176",
		"isParent": 0
	}, {
		"id": "a615be7b-4f73-4267-a686-6ad5902e6ac3",
		"deptName": "手表(1/1)",
		"deviceCount": 1,
		"userName": "shoubiao",
		"pId": "e9c939f1-9c06-4312-b295-47f0162b4176",
		"isParent": 0
	}]
}
```

### Get user profile
*Original heading: 3.获取用户资料*

- **Endpoint:** `getEnterpriseByID`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=getEnterpriseByID&id=cfd2722a-4db6-47ab-974e-d0b6d30a7ecd&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| id | Guid | 是 | 单位id |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"id": "cfd2722a-4db6-47ab-974e-d0b6d30a7ecd",
		"name": "上海科大",
		"phone": null,
		"addr": null,
		"contact": null,            //联系人
		"loginName": "skd",        //登录账号
		"company": "上海科大",    //客户名称/单位名称
		"state": "",
		"area": "",
		"permission": 2,           //树层级
		"grade": 2,                //账户类型
		"artificial_person": "skd",
		"office_tel": null,
		"office_phone": null,
		"credit_grade": "0",          //无
		"status": false,              //是否接收下级报警
		"balance": 0.0,              //无
		"helpTel": "",               //无
		"alarmSound": false          //开启报警声音
	}]
}
```

### Edit user profile
*Original heading: 4.修改用户资料*

- **Endpoint:** `modifyEnterprise`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=modifyEnterprise&id=cfd2722a-4db6-47ab-974e-d0b6d30a7ecd&mds=<MDS>&company=北京科大&loginName=skd&grade=2&contact=&phone=&addr=
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| id | Guid | 是 | 单位id |
| loginName | String | 是 | 登录账号 |
| grade | String | 是 | 客户类型 |
| contact | String | 否 | 联系人 |
| phone | String | 否 | 电话 |
| addr | String | 否 | 地址 |
| company | String | 否 | 客户名称/单位名称 |
| status | Int | 否 | 是否接受下级报警 |

**Developer notes (original, Chinese):**

注意：loginName在注册的时候代表的是单位名称，而在此接口代表的是登录账号。

**Response examples:**

```
成功：
{
	"success": true
}
```

### Reset user password
*Original heading: 5.重置用户密码*

- **Endpoint:** `resetCustomerPWD`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=resetCustomerPWD&mds=<MDS>&school_id=cfd2722a-4db6-47ab-974e-d0b6d30a7ecd
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| school_id | Guid | 是 | 单位id |

**Developer notes (original, Chinese):**

此处有权限验证，若school_id不在令牌的管理范围则接口无效。

**Response examples:**

```
成功：
{
	"success": true,
	"Pwd": "123456"
}
```

### Bulk add devices
*Original heading: 批量添加设备*

- **Endpoint:** `importIMEI`
- **Method:** HTTP
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=importIMEI&mds=<MDS>&macidsandsims=1990041401,;1990041402,;1990041403,&remark=&objectID=9d6ec2fe-a531-49e9-ac92-8a173c2fe428&product_type=218HY
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| objectID | Guid | 是 | 单位id |
| product_type | String | 是 | 设备型号 |
| macidsandsims | String | 是 | 设备号字符串[设备号,sim卡;设备号,sim卡;] |
| remark | String | 否 | 服务商描述 |

**Developer notes (original, Chinese):**

三点：  
接口权限验证，无添加设备权限的用户无法添加。  
Post请求。  
设备号字符串格式必须英文状态下的标点符号。  
后面附有获取型号的方法。

**Response examples:**

```
成功：
{
	"success": true,
	"interance": [],     //失败列表
	"result": [{        //成功列表
		"sim_id": "1990041401"
	}, {
		"sim_id": "1990041402"
	}, {
		"sim_id": "1990041403"
	}],
	"num": 3,         //成功个数
	"balance": 0,       //价格
	"errorCode": null,   //错误描述
	"OrderId": null     //订单号
}
```

### Bulk add devices
*Original heading: 批量添加设备*

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |

请求示例  
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=getUserTypes&mds=<MDS>

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"Id": "218HY",      //型号就是这个字段
		"name": "218HY",
		"WeightNumber": 0,
		"MilNumber": 0,
		"OilNumber": 1,
		"LatlngNumber": 0,
		"TempcNumber": 1,
		"BetteryVNumber": 0,
		"GpsCountNumber": 0,
		"PowerVNumber": 0,
		"GsmLevelNumber": 0,
		"Door": 0,
		"Acc": 1,
		"Sim": 0,
		"Guard": 0,
		"OilElec": 1,
		"Charger": 0,
		"MacType": 17,
		"Clockwise": 1,
		"Vehicle": 0,
		"Lockcnt": 0,
		"TimeZone": 0,
		"HeightNumber": 0,
		"IsOBDDevice": 0,
		"Describe": "ok",
		"Stroke": 0,
		"Photo": 0,
		"Cmd": 1,
		"Money": 1,
		"SignalType": 0,
		"MacTypeId": "XY318",
		"SaveWifiData": false,
		"SaveLbsData": false,
		"CanFilter": true,
		"CanExplainLBS": 0,
		"CanSaveHisState": 0,
		"Rental": false,
		"Video": 0,
		"Pressure": 0
	}]
}
```

### Get full device info
*Original heading: 7.获取设备信息（全）*

- **Endpoint:** `loadUser`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=loadUser&user_id=e9acf370-9cb7-4d38-9089-97a96f4ad040&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| user_id | Guid | 是 | 设备id |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"user_name": "艾玛",               //设备名称
		"sys_time": "2015/09/23 11:45:27",    //最近定位时间
		"datetime": "2015/10/26 16:33:48",    //最近位置更新时间
		"heart_time": "2015/10/26 16:33:48",  //最近信号时间
		"sudu": 0.0,                       //超速设置值
		"status": "",                       //无
		"create_time": "2058/04/21",         //平台到期时间
		"remark": "",                      //备注
		"use_time": "2014/11/29",           //激活时间
		"factory_date": "2014/11/28",        //出厂时间
		"tel": " ",                         //电话
		"sex": "粤B96853",                //车牌号
		"sim_id": "049021604295",          //设备号
		"phone": "185794666",              //sim卡
		"user_id": "e9acf370-9cb7-4d38-9089-97a96f4ad040",
		"grade": 0,                        //无
		"sale_type": 0,                     //无
		"service_flag": "",                  //无
		"product_type": "XY218C",          //型号
		"iconType": "01",                   //图标序号
		"out_time": "2058/04/21",            //用户到期时间
		"jingdu": 114.035221666667,         //经度
		"weidu": 22.6485566666667,         //纬度
		"su": null,                         //iccid
		"owner": " ",                       //联系人
		"jingwei": "114.035221666667;22.6485566666667",
		"alarm": 0,                         //离线报警开关，0关
		"deviceRemark": " ",                 //服务商描述
		"alarmFuel": "",                     //无
		"fuelPerHKM": "",           //无
		"fuelSize": "",               //无
		"maxFuelV": "",             //无
		"minFuelV": "",             //无
		"macVersion": null,           //设备软件版本号
		"FuelTotalHeight": "",         //无  
		"carColor": "",               //无
		"VideoConfig": null,          //视频地址
		"HighTempAlarm": 0.0,       //高温报警值
		"LowTempAlarm": 0.0,        //低温报警值
		"VendorCode": "",            //厂商编码
		"OwnerId": "",               //业主ID
		"PColour": 0,                //车牌颜色
		"TerminalType": "",           //终端类型
		"DeviceCode": ""             //设备编码
	}]
}
```

### Edit full device info (account login)
*Original heading: 8.1【账户登录】修改设备资料（全）*

- **Endpoint:** `modifyUser`
- **Method:** HTTP
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=modifyUser&mds=<MDS>&info=2
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| user_id | Guid | 是 | 设备id |
| info | Int | 是 | 修改类型[2有权修改用户到期,1无权] |
| sex | String | 否 | 车牌号 |
| user_name | String | 否 | 设备名称 |
| remark | String | 否 | 备注 |
| owner | String | 否 | 联系人 |
| tel | String | 否 | 联系电话 |
| phone | String | 否 | sim卡 |
| out_time | String | 否 | 用户到期时间 |
| alarm | Int | 否 | 离线报警开关[0关1开] |
| sudu | Double | 否 | 超速设置值 |
| iconType | String | 否 | 图标序号 |
| HighTempAlarm | Double | 否 | 高温报警值 |
| LowTempAlarm | Double | 否 | 低温报警值 |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
{
	"success": true
}
```

### Edit full device info (device login)
*Original heading: 8.2【设备登录】修改设备资料（全）*

- **Endpoint:** `modifyUser`
- **Method:** HTTP
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=modifyUser&mds=<MDS>&info=3
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| user_id | Guid | 是 | 设备id |
| info | Int | 是 | 修改类型[3] |
| sex | String | 否 | 车牌号 |
| user_name | String | 否 | 设备名称 |
| remark | String | 否 | 备注 |
| owner | String | 否 | 联系人 |
| tel | String | 否 | 联系电话 |
| phone | String | 否 | sim卡 |
| alarm | Int | 否 | 离线报警开关[0关1开] |
| sudu | Double | 否 | 超速设置值 |
| iconType | String | 否 | 图标序号 |
| HighTempAlarm | Double | 否 | 高温报警值 |
| LowTempAlarm | Double | 否 | 低温报警值 |

**Developer notes (original, Chinese):**

对比账户登录修改的区别：  
1.info的值不同，值为固定3；  
2.修改的内容不同。

**Response examples:**

```
成功：
{
	"success": true
}
```

### Reset device password
*Original heading: 9.重置设备密码*

- **Endpoint:** `resetUserPWD`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=resetUserPWD&user_id=9235223f-4907-4904-bbbc-c92110321541&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| user_id | Guid | 是 | 设备id |

**Developer notes (original, Chinese):**

此处有权限验证，若user_id不在令牌的管理范围则接口无效。

**Response examples:**

```
成功：
{
	"success": true,
	"pwd": "123456"
}
```

### Move devices (batch)
*Original heading: 10.批量转移设备*

- **Endpoint:** `moveUser`
- **Method:** HTTP
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?
method=moveUser&cust_id=d7bab2a7-dc43-4546-b9f4-e1bd8d37d774&sim_ids=358740056033425,456456456&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| cust_id | Guid | 是 | 单位id（转给谁） |
| sim_ids | String | 是 | 设备号字符串[设备号,设备号,设备号] |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
{
	"success": true,
	"num": 2,          //成功个数
	"result": [{         //成功列表
		"sim_id": "358740056033425"
	}, {
		"sim_id": "456456456"
	}],
	"interance": []        //失败列表
}
```

### Delete devices (batch)
*Original heading: 11.批量删除设备*

- **Endpoint:** `batchDeleteProduct`
- **Method:** HTTP
- **Example request:**

```
http://apitest.18gps.net/GetDateServices.asmx/GetDate?method=batchDeleteProduct&logn_id=754a5a28-8f24-47ff-908f-c363663ab225&sim_ids=067045065689,358740056031254&custid=e9c939f1-9c06-4312-b295-47f0162b4176&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| logn_id | Guid | 是 | 单位id[登录者] |
| custid | Guid | 是 | 单位id[被操作用户，可以是自己] |
| sim_ids | String | 是 | 设备号字符串[设备号,设备号,设备号] |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
{
	"success": "true"
}
```

### Get device photo album
*Original heading: 12.获取设备相册*

- **Endpoint:** `GetPictureList`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?&method=GetPictureList&macid=078561000561&Count=15&MinTime=1531535062243&mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| macid | Guid | 是 | 设备号 |
| MinTime | Long | 是 | Utc时间戳毫秒数（控制获取范围） |
| Count | Int | 是 | 获取多少张图片 |

**Developer notes (original, Chinese):**

显示更多的做法？  
第一次获取时把minTime设置为明天，如果有10张，说明后面还有，设计一个下拉或者更多的按钮，把刚才10张图片里添加时间最小的那个赋值给minTime继续调用此接口就能得到更多，依次类推能获取所有图片。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"Id": "08ded06e-6b4c-4b3f-a8fd-b94ac36283f0",
		"Macid": "078561000561",
		"PicName": "http://vipapi.18gps.net/GetDateServices.asmx/GetDate?method=DownLoadPicOrVideo&fileName=078561000561_201802020855539804.jpg&mds=<MDS>",
		"Addtime": "2018/02/02 16:55:55",
		"Lat": 22.701765,
		"Lon": 113.821802,
		"Time": 1517561755295
	}, {
		"Id": "305bf138-05e1-4a42-a2e6-75fcdb473cb6",
		"Macid": "078561000561",
		"PicName": "http://vipapi.18gps.net/GetDateServices.asmx/GetDate?method=DownLoadPicOrVideo&fileName=078561000561_201802020855336913.jpg&mds=<MDS>",
		"Addtime": "2018/02/02 16:55:35",
		"Lat": 22.701765,
		"Lon": 113.821802,
		"Time": 1517561735001
	}, {
		"Id": "fc64de3d-7a48-4033-9874-b9ba409585e5",
		"Macid": "078561000561",
		"PicName": "http://vipapi.18gps.net/GetDateServices.asmx/GetDate?method=DownLoadPicOrVideo&fileName=078561000561_201802020855096289.jpg&mds=<MDS>",
		"Addtime": "2018/02/02 16:55:11",
		"Lat": 22.701765,
		"Lon": 113.821802,
		"Time": 1517561711460
	}, {
		"Id": "94219176-fd25-4a4b-b686-56f5406ed75c",
		"Macid": "078561000561",
		"PicName": "http://vipapi.18gps.net/GetDateServices.asmx/GetDate?method=DownLoadPicOrVideo&fileName=078561000561_201802020854248323.jpg&mds=<MDS>",
		"Addtime": "2018/02/02 16:54:27",
		"Lat": 22.701765,
		"Lon": 113.821802,
		"Time": 1517561667196
	}]
}
```

### Get device videos
*Original heading: 13.获取设备视频*

- **Endpoint:** `GetVideoList`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?&method=GetVideoList&macid=078561000561&Count=10&MinTime=1531535094212mds=<MDS>
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| macid | Guid | 是 | 设备号 |
| MinTime | Long | 是 | Utc时间戳毫秒数（控制获取范围） |
| Count | Int | 是 | 获取多少张图片 |

**Developer notes (original, Chinese):**

无。

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"data": [{
		"Id": "413ac1cc-5796-4c53-9bf1-1574049c602c",
		"Macid": "078561000561",
		"VideoName": "http://vipapi.18gps.net/GetDateServices.asmx/GetDate?method=DownLoadPicOrVideo&video=078561000561_201802020856222301.mp4&mds=<MDS>",
		"Addtime": "2018/02/02 16:56:25",
		"Lat": 22.701765,
		"Lon": 113.821802,
		"Time": 1517561785131
	}, {
		"Id": "4266c302-f49b-47a8-881b-3a1c616201fc",
		"Macid": "078561000561",
		"VideoName": "http://vipapi.18gps.net/GetDateServices.asmx/GetDate?method=DownLoadPicOrVideo&video=078561000561_201802020854457805.mp4&mds=<MDS>",
		"Addtime": "2018/02/02 16:54:48",
		"Lat": 22.701765,
		"Lon": 113.821802,
		"Time": 1517561688710
	}]
}
```


---

## Part 4: Web pages

这个是网页版的接口，提供参数即可拿到网页。

http://www.18gps.net/GetDataService.aspx?method=loginSystem&LoginName=<LOGIN_NAME>&LoginPassword=<PASSWORD>&LoginType=ENTERPRISE&language=cn&ISMD5=0&timeZone=8&apply=APP&loginUrl=

> **English:** "This is the web-page interface: supply the parameters and you get a web page." The example below is a login URL on `www.18gps.net` (credentials redacted).

### Web page: follow vehicle (live map)
*Original heading: 1.跟车页面*

- **Endpoint (method name):** `Follow`
- **Method:** HTTP GET
- **Example request:**

```
http://www.18gps.net:8028/RouterPass.ashx?method=Follow&mds=<MDS>&custid=1a9b8748-ff05-450a-9edd-9dfebbf0fbae&mapType=BAIDU&deviceid=7a01aa2e-0df2-43d7-8b03-2bea882f336b&deviceName=郭sir
```

**Parameters** (原: 参数=name, 类型=type, 必填=required 是=yes/否=no)

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| custid | Guid | 是 | 单位id |
| mapType | String | 是 | 地图类型(BAIDU) |
| deviceid | Guid | 是 | 设备id |
| deviceName | String | 否 | 设备名称 |

**Description and response (original, Chinese comments kept):**

```
接口描述：无。
```

### Web page: playback
*Original heading: 2.回放页面*

- **Endpoint (method name):** `Playback`
- **Method:** HTTP GET
- **Example request:**

```
http://www.18gps.net:8028/RouterPass.ashx?method=Playback&mds=<MDS>&custid=1a9b8748-ff05-450a-9edd-9dfebbf0fbae&mapType=BAIDU&deviceid=7a01aa2e-0df2-43d7-8b03-2bea882f336b&deviceName=郭sir
```

**Parameters** (原: 参数=name, 类型=type, 必填=required 是=yes/否=no)

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| mds | String | 是 | 令牌 |
| custid | Guid | 是 | 单位id |
| mapType | String | 是 | 地图类型(BAIDU) |
| deviceid | Guid | 是 | 设备id |
| deviceName | String | 否 | 设备名称 |

**Description and response (original, Chinese comments kept):**

```
接口描述：无。
```


---

## Part 5: Deprecated

### [DEPRECATED] Vehicle condition data
*Original heading: 1.获取车况数据【作废】*

- **Endpoint (method name):** `getCarHardWare/getVehicleData`
- **Method:** HTTP GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?&method=getCarHardWare&macid=xy1610100063&mds=<MDS>
```

**Parameters** (原: 参数=name, 类型=type, 必填=required 是=yes/否=no)

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| macid | String | 是 | 设备号 |
| mds | String | 是 | 令牌 |

**Description and response (original, Chinese comments kept):**

```
接口描述：无
返回 [JSON]：
成功：
{
	"success": "true",
	"errorCode": 200,
	"errorDescribe": "取车况数据成功",
	"obdList": [],
	"obdcode": "健康分数",
	"obdcodestr": "健康分数",
	"obddescription": "100",
	"rows": {
		"macid": "xy1610100063",//设备号
		"P1": 0.0,//车速
		"P2": 0.0,//发动机转速
		"P3": 0.0,//发动机冷却液温度
		"P4": 65.535,//空气流量
		"P5": 0.0,//空气温度
		"P6": 0.0,//进气歧管绝对压力
		"P7": 0.0,//长期燃油修正
		"P8": 0.0,//环境温度
		"P9": 0.0,//里程
		"P10": 0.0,//负荷计算值
		"P11": 0.0,//节气门绝对位置
		"P12": 0.0,//气缸1点火提前角
		"P13": 0.0,//瞬间油耗
		"P14": 0.0,//累加油耗
		"P15": 0.0,//加速踏板D
		"P16": 0.0,//加速踏板E
		"P17": 0.0,//加速踏板F
		"P18": 0.0,//控制模块电压
		"P47": 0.0,//剩余油量
		"speed": 0.0,//速度
		"fraction": "100",//评分
		"StateTime": "2018/1/25 17:12:50",//车况状态时间
		"CurCodeTime": "2018/1/25 17:12:13",//最近上传故障码时间
		"HisCodeTime": "2018/1/25 17:12:13"//此字段【弃用】
	}
}
失败：
{
}
```

### [DEPRECATED] Fault codes
*Original heading: 2.获取故障码【作废】*

- **Endpoint (method name):** `getCurCodeV3`
- **Method:** HTTP GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=getCurCodeV3&macid=xy1610100063&mds=<MDS>
```

**Parameters** (原: 参数=name, 类型=type, 必填=required 是=yes/否=no)

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| macid | String | 是 | 设备号 |
| mds | String | 是 | 令牌 |

**Description and response (original, Chinese comments kept):**

```
接口描述：无
返回 [JSON]：
成功：
{
	"success": "true",
	"errorCode": "200",
	"errorDescribe": "",
	"err": "",
	"info": "",
	"data": [],//故障码
	"obdSys": [{
		"sysId": "0",
		"obdTitle": "车身系统",//描述
		"obdCount": 0
	}, {
		"sysId": "1",
		"obdTitle": "底盘系统",
		"obdCount": 0
	}],
	"fraction": 100
}
失败：
{
}
```

### [DEPRECATED] Account registration
*Original heading: 3.账户注册（请使用11账户注册新）【作废】*

- **Endpoint:** `LXVehicleInfoRegister`
- **Method:** HTTP  GET
- **Example request:**

```
http://apitest.18gps.net//GetDateServices.asmx/GetDate?method=LXVehicleInfoRegister&username=<PHONE>&password=123456&parentId=d99bf6240faf4cdd9771469db0db98c8
```

**Parameters** (original column labels: 参数=name, 类型=type, 必填=required 是=yes/否=no, 描述=description)

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| method | String | 是 | 接口名称 |
| username | String | 是 | 注册账号/手机号码 |
| password | String | 是 | 注册密码 |
| parentId | Guid | 是 | 父级单位id（直属关系） |

**Developer notes (original, Chinese):**

接口中的参数parentId需要指定一个上级id，所有的注册用户均归属这个id的用户来管理，此id需要向业务部申请。  
  
错误码：  
200  注册成功  
500  注册失败  
1001 账号已存在/电话号码已存在  
1002 父级单位不存在，没有填写父级id  
1005 账号或者密码不能为空

**Response examples:**

```
成功：
{
	"success": "true",
	"errorCode": "200", //注册成功
	"errorDescribe": "",
	"data": []
}
失败：
{
	"success": "false",
	"errorCode": "1001", //账号已存在/电话号码已存在
	"errorDescribe": "",
	"data": []
}
```
