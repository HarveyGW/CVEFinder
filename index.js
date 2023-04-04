const config = require('./config.json');
const axios = require('axios');
const { Client, Intents, MessageEmbed } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');


const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

const COMMAND_LOOKUP = 'lookup';
const OPTION_CVE = 'cve';
const PREFIX_CVE = 'CVE-';

const COMMAND_SEARCH = 'search';
const OPTION_KEYWORD = 'keyword';

const COMMAND_LATEST = 'latest';
const OPTION_COUNT = 'count';

const COMMAND_HELP = 'help';

client.once('ready', async () => {
  console.log('Ready!');

  const commands = [
    {
      name: COMMAND_LOOKUP,
      description: 'Lookup a specific CVE by its ID',
      options: [
        {
          name: OPTION_CVE,
          type: 3, // Corresponds to the STRING type
          description: 'The CVE ID to lookup',
          required: true,
        },
      ],
    },
		{
      name: COMMAND_HELP,
      description: 'Display help manual for the bot commands',
    },
    {
      name: COMMAND_SEARCH,
      description: 'Search for CVEs by keywords',
      options: [
        {
          name: OPTION_KEYWORD,
          type: 3, // Corresponds to the STRING type
          description: 'The keyword to search for',
          required: true,
        },
      ],
    },
		{
		  name: 'latest',
		  description: 'Fetch the latest CVEs',
		  options: [
		    {
		      name: 'count',
		      type: 4, // Corresponds to the INTEGER type
		      description: 'The number of latest CVEs to fetch',
		      required: false,
		    },
  		],
	},
];

  try {
    await new REST({ version: '9' })
      .setToken(config.token)
      .put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body: commands,
      });

    console.log('Successfully registered Slash Commands.');
  } catch (error) {
    console.error('Failed to register Slash Commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

	if (commandName === COMMAND_HELP) {
	  const helpEmbed = new MessageEmbed()
	    .setTitle('CVE Bot Help')
	    .setDescription('A list of commands available for the CVE bot:')
	    .addField('/lookup', 'Lookup a specific CVE by its ID\nUsage: `/lookup cve:<CVE_ID>`')
	    .addField('/search', 'Search for CVEs by keywords\nUsage: `/search keyword:<keyword>`')
	    .addField('/latest', 'Fetch the latest CVEs\nUsage: `/latest [count:<number>]` (Optional count parameter to fetch a specific number of latest CVEs, default is 10)')
	    .setColor('#0099ff');
	
	  await interaction.reply({ embeds: [helpEmbed] });
	}
	if (commandName === COMMAND_LATEST) {
	  (async () => {
	    const count = options.getInteger(OPTION_COUNT) || 10;
	    try {
	      await interaction.deferReply();
	      const currentDate = new Date();
	      const startDate = new Date(currentDate);
	      startDate.setDate(startDate.getDate() - 7);
	      const endDate = currentDate;
	
	      const startDateString = encodeURIComponent(formatDate(startDate));
	      const endDateString = encodeURIComponent(formatDate(endDate));
	
	      const url = `https://services.nvd.nist.gov/rest/json/cves/1.0?resultsPerPage=${count}&startIndex=0&pubStartDate=${startDateString}&pubEndDate=${endDateString}`;
	      const latestResponse = await axios.get(url);
	      const latestResults = latestResponse.data.result.CVE_Items;
	      if (latestResults.length === 0) {
	        await interaction.editReply({ content: 'No latest CVEs found.' });
	      } else {
	        const pages = [];
	        for (const result of latestResults) {
	          const cve = result.cve.CVE_data_meta.ID;
	          const cveDescription = result.cve.description.description_data[0].value;
	          const severity = result.impact.baseMetricV3 && result.impact.baseMetricV3.cvssV3 ? result.impact.baseMetricV3.cvssV3.baseSeverity : 'UNKNOWN';
	
	          const embed = new MessageEmbed()
	            .setTitle(`${cve}`)
	            .setColor(getSeverityColor(severity))
	            .setDescription(cveDescription)
	            .addField('Severity', severity);
	
	          pages.push(embed);
	        }
	        const emojiList = ['⬅️', '➡️'];
	        const timeout = 60000; // Timeout for the pagination (in milliseconds)
	        const sentMsg = await interaction.followUp({ embeds: [pages[0]], fetchReply: true });
					paginationEmbed(interaction, pages, emojiList, timeout);
	      }
	    } catch (error) {
	      console.error(error);
	      await interaction.editReply({ content: 'An error occurred while fetching the latest CVEs. Please try again later.' });
	    }
	  })();
	} else if (commandName === COMMAND_LOOKUP) {
    try {
      await interaction.deferReply();
      let cve = options.getString(OPTION_CVE);
      if (!cve.startsWith(PREFIX_CVE)) {
        cve = PREFIX_CVE + cve;
      }

      const nvdResponse = await axios.get(`https://services.nvd.nist.gov/rest/json/cve/1.0/${cve}`);
      const nvdData = nvdResponse.data.result.CVE_Items[0];
      const cveDescription = nvdData.cve.description.description_data[0].value;
      const severity = nvdData.impact.baseMetricV3.cvssV3.baseSeverity;

      const embed = new MessageEmbed()
        .setTitle(`${cve}`)
        .setColor(getSeverityColor(severity))
        .setDescription(cveDescription)
        .addField('Severity', severity);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: 'An error occurred while retrieving the CVE information. Please make sure the CVE number is correct.' });
    }
  } else if (commandName === COMMAND_SEARCH) {
    const keyword = options.getString(OPTION_KEYWORD);
    try {
      await interaction.deferReply();
      const searchResponse = await axios.get(`https://services.nvd.nist.gov/rest/json/cves/1.0?keyword=${encodeURIComponent(keyword)}`);
      const searchResults = searchResponse.data.result.CVE_Items;
      if (searchResults.length === 0) {
        await interaction.editReply({ content: 'No results found for the given keyword.' });
      } else {
        await displaySearchResults(interaction, searchResults);
      }
    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: 'An error occurred while searching for CVEs. Please try again later.' });
    }
  }

});

async function paginationEmbed(interaction, pages, emojiList = ['⬅️', '➡️'], timeout = 60000) {
  let page = 0;

  await interaction.editReply({ embeds: [pages[page]] });
  const paginationMessage = await interaction.fetchReply();

  for (const emoji of emojiList) {
    await paginationMessage.react(emoji);
  }

  const filter = (reaction, user) => emojiList.includes(reaction.emoji.name) && !user.bot;
  const collector = paginationMessage.createReactionCollector({ filter, time: timeout });

  collector.on('collect', async (reaction, user) => {
    reaction.users.remove(user.id);

    switch (reaction.emoji.name) {
      case emojiList[0]:
        page = page > 0 ? page - 1 : pages.length - 1;
        break;
      case emojiList[1]:
        page = page + 1 < pages.length ? page + 1 : 0;
        break;
      default:
        break;
    }

    await paginationMessage.edit({ embeds: [pages[page]] });
  });

  collector.on('end', () => {
    paginationMessage.reactions.removeAll();
  });
}


function formatDate(date) {
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const SSS = String(date.getMilliseconds()).padStart(3, '0');
  const Z = ' UTC-00:00';

  return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}:${SSS}${Z}`;
}


async function displaySearchResults(interaction, searchResults) {
  const pages = [];

  for (const result of searchResults) {
    const embed = new MessageEmbed()
      .setTitle(result.cve.CVE_data_meta.ID)
      .setDescription(result.cve.description.description_data[0].value)
      .addField('Severity', result.impact.baseMetricV3.cvssV3.baseSeverity)
      .setColor(getSeverityColor(result.impact.baseMetricV3.cvssV3.baseSeverity));

    pages.push(embed);
  }

  const emojiList = ['⬅️', '➡️'];
  const timeout = 60000; // Timeout for the pagination (in milliseconds)

  paginationEmbed(interaction, pages, emojiList, timeout);
}

function getSeverityColor(severity) {
  switch (severity) {
    case 'CRITICAL':
      return '#ff0000';
    case 'HIGH':
      return '#ff8c00';
    case 'MEDIUM':
      return '#ffdf00';
    case 'LOW':
      return '#00ff00';
    default:
      return '#ffffff';
  }
}

client.login(config.token);

